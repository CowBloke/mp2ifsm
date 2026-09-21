"use server";

import { verifierRevision } from "./revision-token";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { query, queryOne, tx } from "./db";
import { ErreurMetier, messageFr } from "./errors";
import { exigerAdmin, exigerUtilisateur } from "./session";
import { noteDepuisCle, noterProjection, versDb, formatIntervalle, type EtatDb } from "./fsrs";
import { matiereDuFormulaire } from "./matieres";
import type { Reponse } from "./actions";

function echec(err: unknown): { ok: false; erreur: string } {
  if (!(err instanceof ErreurMetier)) console.error(err);
  return { ok: false, erreur: messageFr(err) };
}

/* ------------------------------------------------------------------ */
/* Révision                                                            */
/* ------------------------------------------------------------------ */

export type ResultatRevision = {
  cardId: number;
  etat: string;
  due: string;
  intervalle: string;
};

/**
 * Enregistre une révision.
 *
 * Lecture de l'état, calcul FSRS et écriture se font dans UNE
 * transaction, avec verrou de ligne : deux onglets ouverts sur la même
 * carte ne peuvent pas produire deux planifications divergentes. Le
 * client envoie seulement la note ; il ne calcule aucune date.
 */
export async function reviserCarte(
  cardId: number,
  cleNote: string,
  jeton: string,
  dureeMs?: number,
): Promise<Reponse<ResultatRevision>> {
  try {
    const u = await exigerUtilisateur();

    const note = noteDepuisCle(cleNote);
    if (note === null) throw new ErreurMetier("NOTE_INVALIDE");
    if (!Number.isSafeInteger(cardId) || cardId <= 0) throw new ErreurMetier("CARTE_INTROUVABLE");

    const projection = verifierRevision(jeton, u.id, cardId);
    const resultat = await tx(async (c) => {
      await c.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`${u.id}:${cardId}`]);
      const existe = await c.query<{ abonne: boolean }>(
        `select exists (select 1 from deck_subscription ab
                         where ab.deck_id = k.deck_id and ab.user_id = $2::uuid) as abonne
           from card k where k.id = $1 and k.deleted_at is null`, [cardId, u.id]);
      if (existe.rowCount === 0) throw new ErreurMetier("CARTE_INTROUVABLE");
      if (!existe.rows[0].abonne) throw new ErreurMetier("PAS_ABONNE");

      // Verrou sur l'état de CE membre pour CETTE carte.
      const actuel = await c.query<EtatDb>(
        `select state::text as state, due, stability, difficulty, elapsed_days,
                scheduled_days, learning_steps, reps, lapses, last_review
           from card_state where user_id = $1::uuid and card_id = $2 for update`,
        [u.id, cardId],
      );
      const etat = actuel.rows[0] ?? null;

      if ((etat?.reps ?? 0) !== projection.reps) throw new ErreurMetier("REVISION_EXPIREE");
      const maintenant = new Date();
      const { card: suivante, log } = noterProjection(etat, note, projection.now, maintenant);
      const d = versDb(suivante);

      await c.query(
        `insert into card_state (user_id, card_id, state, due, stability, difficulty,
                                 elapsed_days, scheduled_days, learning_steps,
                                 reps, lapses, last_review)
         values ($1::uuid,$2,$3::fsrs_state,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         on conflict (user_id, card_id) do update set
           state = excluded.state, due = excluded.due,
           stability = excluded.stability, difficulty = excluded.difficulty,
           elapsed_days = excluded.elapsed_days, scheduled_days = excluded.scheduled_days,
           learning_steps = excluded.learning_steps,
           reps = excluded.reps, lapses = excluded.lapses,
           last_review = excluded.last_review`,
        [u.id, cardId, d.state, d.due, d.stability, d.difficulty, d.elapsed_days,
         d.scheduled_days, d.learning_steps, d.reps, d.lapses, d.last_review],
      );

      await c.query(
        `insert into review_log (user_id, card_id, rating, state, due, stability,
                                 difficulty, elapsed_days, last_elapsed_days,
                                 scheduled_days, reviewed_at, duree_ms)
         values ($1::uuid,$2,$3,$4::fsrs_state,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [u.id, cardId, note, (["New","Learning","Review","Relearning"])[log.state],
         log.due, log.stability, log.difficulty,
         Math.max(0, Math.round(log.elapsed_days)),
         Math.max(0, Math.round(log.last_elapsed_days)),
         Math.max(0, Math.round(log.scheduled_days)), maintenant,
         Number.isSafeInteger(dureeMs) && dureeMs! >= 0 && dureeMs! <= 2147483647 ? dureeMs : null],
      );

      return {
        cardId,
        etat: d.state,
        due: new Date(d.due).toISOString(),
        // Dérivé de la date RÉELLEMENT planifiée, pas d'une reprojection :
        // le fuzz FSRS ferait diverger les deux.
        intervalle: formatIntervalle(new Date(d.due), maintenant),
      };
    });

    return { ok: true, data: resultat };
  } catch (err) {
    return echec(err);
  }
}

/* ------------------------------------------------------------------ */
/* Paquets                                                             */
/* ------------------------------------------------------------------ */

const SchemaPaquet = z.object({
  titre: z.string().trim().min(2).max(120),
  chapitre: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
});

export async function creerPaquet(formData: FormData): Promise<Reponse<{ slug: string }>> {
  try {
    const u = await exigerUtilisateur();
    const p = SchemaPaquet.safeParse({
      titre: formData.get("titre"),
      chapitre: formData.get("chapitre"),
      description: formData.get("description") || undefined,
    });
    if (!p.success) return { ok: false, erreur: "Formulaire invalide" };

    const slug = await tx(async (c) => {
      const matiere = await matiereDuFormulaire(formData.get("matiere"), c);
      const nom = matiere === null ? "" : (await c.query<{ nom: string }>(
        `select nom from subject where id = $1`, [matiere])).rows[0].nom;
      const base = slugifier(`${nom}-${p.data.chapitre}-${p.data.titre}`);
      let candidat = base;
      for (let n = 2; ; n++) {
        const pris = await c.query(`select 1 from deck where slug = $1`, [candidat]);
        if (pris.rowCount === 0) break;
        candidat = `${base.slice(0, 58)}-${n}`;
      }
      const d = await c.query<{ id: number }>(
        `insert into deck (slug, titre, subject_id, chapitre, description, created_by)
         values ($1,$2,$3,$4,$5,$6::uuid) returning id`,
        [candidat, p.data.titre, matiere, p.data.chapitre,
         p.data.description ?? null, u.id],
      );
      // Qui crée un paquet le suit : c'est lui qui va le remplir.
      await c.query(
        `insert into deck_subscription (user_id, deck_id) values ($1::uuid, $2)`,
        [u.id, d.rows[0].id],
      );
      return candidat;
    });

    revalidatePath("/fiches");
    return { ok: true, data: { slug } };
  } catch (err) {
    return echec(err);
  }
}

/**
 * Suivre ou ne plus suivre un paquet. Se désabonner ne touche ni
 * card_state ni review_log : un réabonnement reprend la planification
 * exactement là où elle en était.
 */
export async function suivrePaquet(
  deckId: number,
  suivre: boolean,
): Promise<Reponse<{ abonne: boolean }>> {
  try {
    const u = await exigerUtilisateur();
    if (!Number.isSafeInteger(deckId) || deckId <= 0 || typeof suivre !== "boolean") {
      throw new ErreurMetier("PAQUET_INTROUVABLE");
    }
    if (suivre) {
      const r = await query(
        `insert into deck_subscription (user_id, deck_id)
         select $1::uuid, id from deck where id = $2 and archived_at is null
         on conflict do nothing returning deck_id`,
        [u.id, deckId],
      );
      if (r.length === 0) {
        const existe = await queryOne(`select 1 from deck_subscription
          where user_id = $1::uuid and deck_id = $2`, [u.id, deckId]);
        if (!existe) throw new ErreurMetier("PAQUET_INTROUVABLE");
      }
    } else {
      await query(`delete from deck_subscription where user_id = $1::uuid and deck_id = $2`,
        [u.id, deckId]);
    }
    revalidatePath("/fiches");
    revalidatePath("/");
    return { ok: true, data: { abonne: suivre } };
  } catch (err) {
    return echec(err);
  }
}

/** Reclasse un paquet : son créateur ou un administrateur. */
export async function changerMatierePaquet(
  deckId: number,
  matiere: string,
): Promise<Reponse<undefined>> {
  try {
    const u = await exigerUtilisateur();
    const id = await matiereDuFormulaire(matiere);
    const r = await query(
      `update deck set subject_id = $2
        where id = $1 and ($4::boolean or created_by = $3::uuid) returning id`,
      [deckId, id, u.id, u.role === "admin"],
    );
    if (r.length === 0) throw new ErreurMetier("NON_AUTORISE");
    revalidatePath("/fiches");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}

function slugifier(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "paquet";
}

/* ------------------------------------------------------------------ */
/* Cartes — n'importe qui peut en ajouter, tout est tracé              */
/* ------------------------------------------------------------------ */

const SchemaCarte = z.object({
  recto: z.string().trim().min(1).max(8000),
  verso: z.string().trim().min(1).max(8000),
});

export async function ajouterCarte(
  deckId: number,
  recto: string,
  verso: string,
): Promise<Reponse<{ cardId: number }>> {
  try {
    const u = await exigerUtilisateur();
    const p = SchemaCarte.safeParse({ recto, verso });
    if (!p.success) throw new ErreurMetier("CARTE_VIDE");

    const r = await queryOne<{ id: number }>(
      `insert into card (deck_id, recto, verso, author_id) values ($1,$2,$3,$4::uuid)
       returning id`,
      [deckId, p.data.recto, p.data.verso, u.id],
    );

    revalidatePath("/fiches");
    return { ok: true, data: { cardId: r!.id } };
  } catch (err) {
    return echec(err);
  }
}

/**
 * Modifie une carte. La révision précédente est conservée par le
 * trigger `card_revision_auto`, donc une correction est toujours
 * réversible et attribuable.
 */
export async function modifierCarte(
  cardId: number,
  recto: string,
  verso: string,
  motif: string,
): Promise<Reponse<undefined>> {
  try {
    const u = await exigerUtilisateur();
    const p = SchemaCarte.safeParse({ recto, verso });
    if (!p.success) throw new ErreurMetier("CARTE_VIDE");

    await tx(async (c) => {
      const avant = await c.query<{ recto: string; verso: string }>(
        `select recto, verso from card where id = $1 and deleted_at is null for update`,
        [cardId],
      );
      if (avant.rowCount === 0) throw new ErreurMetier("CARTE_INTROUVABLE");
      if (avant.rows[0].recto === p.data.recto && avant.rows[0].verso === p.data.verso) {
        return;
      }

      await c.query(
        `update card set recto = $2, verso = $3, updated_at = now() where id = $1`,
        [cardId, p.data.recto, p.data.verso],
      );
      // Révision explicite : elle porte l'auteur de la MODIFICATION,
      // là où le trigger d'insertion porte l'auteur d'origine.
      await c.query(
        `insert into card_revision (card_id, recto, verso, edited_by, motif)
         values ($1,$2,$3,$4::uuid,$5)`,
        [cardId, p.data.recto, p.data.verso, u.id, motif.trim() || null],
      );
    });

    revalidatePath("/fiches");
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}

export async function signalerCarte(cardId: number, motif: string): Promise<Reponse<undefined>> {
  try {
    const u = await exigerUtilisateur();
    if (motif.trim().length < 3) throw new ErreurMetier("MOTIF_TROP_COURT");

    await query(
      `insert into card_report (card_id, reported_by, motif) values ($1,$2::uuid,$3)
       on conflict do nothing`,
      [cardId, u.id, motif.trim()],
    );

    revalidatePath("/fiches");
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}

export async function resoudreSignalement(reportId: number): Promise<Reponse<undefined>> {
  try {
    const u = await exigerAdmin();
    await query(
      `update card_report set resolved_at = now(), resolved_by = $2::uuid
        where id = $1 and resolved_at is null`,
      [reportId, u.id],
    );
    revalidatePath("/fiches");
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}

/** Suppression douce : l'auteur ou un admin seulement. */
export async function supprimerCarte(cardId: number): Promise<Reponse<undefined>> {
  try {
    const u = await exigerUtilisateur();
    const r = await query<{ id: number }>(
      `update card set deleted_at = now(), deleted_by = $2::uuid
        where id = $1 and deleted_at is null
          and ($3::boolean or author_id = $2::uuid)
        returning id`,
      [cardId, u.id, u.role === "admin"],
    );
    if (r.length === 0) throw new ErreurMetier("NON_AUTORISE");
    revalidatePath("/fiches");
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}

/** Partage des statistiques dans la heatmap de classe (opt-in). */
export async function basculerPartageStats(actif: boolean): Promise<Reponse<{ actif: boolean }>> {
  try {
    const u = await exigerUtilisateur();
    await query(`update app_user set partage_stats = $2 where id = $1::uuid`, [u.id, actif]);
    revalidatePath("/profil");
    revalidatePath("/fiches");
    return { ok: true, data: { actif } };
  } catch (err) {
    return echec(err);
  }
}

/* ------------------------------------------------------------------ */
/* Session de révision                                                 */
/* ------------------------------------------------------------------ */

export type CarteRendue = {
  jeton: string;
  cardId: number;
  rectoHtml: string;
  rectoReveleHtml: string;
  versoHtml: string;
  auteur: string;
  signalee: boolean;
  apercu: Array<{ cle: string; label: string; touche: string; intervalle: string }>;
  restant: { nouvelles: number; apprentissage: number; a_revoir: number };
  nouvelle: boolean;
};

/**
 * Carte suivante de la session, déjà composée.
 *
 * Le HTML (KaTeX compris) est produit ici : le navigateur ne reçoit ni
 * la bibliothèque de rendu, ni les intervalles à calculer.
 */
export async function carteSuivante(deckId: number): Promise<Reponse<CarteRendue | null>> {
  try {
    const u = await exigerUtilisateur();
    const { prochaineCarte } = await import("./fiches");
    const { composerCarte } = await import("./rendu");

    const c = await prochaineCarte(u.id, deckId);
    if (!c) return { ok: true, data: null };

    return {
      ok: true,
      data: {
        jeton: c.jeton,
        cardId: c.card_id,
        ...composerCarte(c.recto, c.verso),
        auteur: c.auteur,
        signalee: c.signalee,
        apercu: c.apercu,
        restant: c.restant,
        nouvelle: c.etat === null,
      },
    };
  } catch (err) {
    return echec(err);
  }
}

/**
 * Aperçu d'un contenu de carte (LaTeX composé, images résolues).
 * Permet de vérifier une formule avant d'enregistrer, sans embarquer
 * KaTeX dans le navigateur.
 */
export async function previsualiser(source: string): Promise<Reponse<{ html: string }>> {
  try {
    await exigerUtilisateur();
    const { rendreContenu } = await import("./rendu");
    return { ok: true, data: { html: rendreContenu(source.slice(0, 8000)) } };
  } catch (err) {
    return echec(err);
  }
}

export type RevisionRendue = {
  id: number; auteur: string; edited_at: string; motif: string | null;
  rectoHtml: string; versoHtml: string;
};

/** Historique d'une carte, chargé à la demande. */
export async function historiqueCarteAction(
  cardId: number,
): Promise<Reponse<RevisionRendue[]>> {
  try {
    await exigerUtilisateur();
    const { historiqueCarte } = await import("./fiches");
    const { rendreContenu } = await import("./rendu");
    const lignes = await historiqueCarte(cardId);
    return {
      ok: true,
      data: lignes.map((r) => ({
        id: r.id, auteur: r.auteur, edited_at: r.edited_at, motif: r.motif,
        rectoHtml: rendreContenu(r.recto), versoHtml: rendreContenu(r.verso),
      })),
    };
  } catch (err) {
    return echec(err);
  }
}
