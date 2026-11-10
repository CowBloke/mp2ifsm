import "server-only";
import { query, queryOne, tx } from "./db";
import { ErreurMetier } from "./errors";
import { formatIntervalle, noteDepuisCle, noterProjection, versDb, type EtatDb } from "./fsrs";
import { verifierRevision } from "./revision-token";
import type { Utilisateur } from "./session";

/*
 * Révision des fiches : carte suivante, notation FSRS, abonnement et
 * « j'aime ». Partagé par les actions du site et l'API de l'app ; tout
 * lève des ErreurMetier, l'appelant traduit.
 */

export type ResultatRevision = {
  cardId: number;
  etat: string;
  due: string;
  intervalle: string;
};

export type CarteRendue = {
  jeton: string;
  cardId: number;
  rectoHtml: string;
  rectoReveleHtml: string;
  versoHtml: string;
  trousHtml: string[];
  auteur: string;
  signalee: boolean;
  apercu: Array<{ cle: string; label: string; touche: string; intervalle: string }>;
  restant: { nouvelles: number; apprentissage: number; a_revoir: number };
  nouvelle: boolean;
  /** Titre du paquet de la carte (le flash mélange les paquets). */
  paquet: string;
};

/**
 * Carte suivante de la session, déjà composée.
 *
 * Le HTML (KaTeX compris) est produit ici : le client ne reçoit ni la
 * bibliothèque de rendu, ni les intervalles à calculer.
 */
export async function carteRendue(
  u: Utilisateur,
  deckId: number | null,
  exclure: number[] = [],
): Promise<CarteRendue | null> {
  const { prochaineCarte } = await import("./fiches");
  const { composerCarte } = await import("./rendu");

  if (deckId !== null && (!Number.isSafeInteger(deckId) || deckId <= 0)) throw new ErreurMetier("PAQUET_INTROUVABLE");
  const vues = Array.isArray(exclure)
    ? exclure.filter((n) => Number.isSafeInteger(n) && n > 0).slice(0, 50) : [];
  const c = await prochaineCarte(u.id, deckId, vues);
  if (!c) return null;

  return {
    jeton: c.jeton,
    cardId: c.card_id,
    ...composerCarte(c.recto, c.verso),
    auteur: c.auteur,
    signalee: c.signalee,
    apercu: c.apercu,
    restant: c.restant,
    nouvelle: c.etat === null,
    paquet: c.deck_titre,
  };
}

/**
 * Enregistre une révision.
 *
 * Lecture de l'état, calcul FSRS et écriture se font dans UNE
 * transaction, avec verrou : deux appareils ouverts sur la même carte ne
 * peuvent pas produire deux planifications divergentes. Le client envoie
 * seulement la note ; il ne calcule aucune date.
 */
export async function enregistrerRevision(
  u: Utilisateur,
  cardId: number,
  cleNote: string,
  jeton: string,
  dureeMs?: number,
): Promise<ResultatRevision> {
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

  return resultat;
}

/**
 * Suivre ou ne plus suivre un paquet. Ne plus le suivre garde la
 * progression : un nouvel abonnement reprend exactement là où elle en était.
 */
export async function abonnerPaquet(u: Utilisateur, deckId: number, suivre: boolean): Promise<void> {
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
}

export async function aimerPaquetPour(
  u: Utilisateur, deckId: number, aime: boolean,
): Promise<{ likes: number; aime: boolean }> {
  if (!Number.isSafeInteger(deckId) || deckId <= 0 || typeof aime !== "boolean") {
    throw new ErreurMetier("PAQUET_INTROUVABLE");
  }
  if (aime) {
    await query(
      `insert into deck_like (user_id, deck_id)
       select $1::uuid, id from deck where id = $2 and archived_at is null
       on conflict do nothing`, [u.id, deckId]);
  } else {
    await query(`delete from deck_like where user_id = $1::uuid and deck_id = $2`, [u.id, deckId]);
  }
  const r = await queryOne<{ likes: number; aime: boolean }>(
    `select count(*)::int as likes, bool_or(user_id = $2::uuid) as aime
       from deck_like where deck_id = $1`, [deckId, u.id]);
  return { likes: r?.likes ?? 0, aime: r?.aime ?? false };
}
