import "server-only";
import { z } from "zod";
import { query, queryOne, tx } from "./db";
import { ErreurMetier } from "./errors";
import { matiereDuFormulaire } from "./matieres";
import { dossierDuFormulaire } from "./dossiers-formulaire";
import type { Utilisateur } from "./session";

/*
 * Écriture des fiches : paquets et cartes. Partagé par les actions du
 * site et l'API de l'app ; tout lève des ErreurMetier, l'appelant traduit.
 * N'importe quel membre peut ajouter ou corriger une carte : chaque
 * modification laisse une révision attribuée (table card_revision).
 */

const SchemaPaquet = z.object({
  titre: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional(),
});

const SchemaCarte = z.object({
  recto: z.string().trim().min(1).max(8000),
  verso: z.string().trim().min(1).max(8000),
});

function slugifier(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "paquet";
}

function exigerId(n: unknown, code: string): number {
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n <= 0) throw new ErreurMetier(code);
  return n;
}

export type ChampsPaquet = { titre: unknown; description?: unknown; matiere?: unknown; dossier?: unknown };

/** Crée un paquet ; son créateur le suit d'office. Renvoie id et slug. */
export async function creerPaquetPour(u: Utilisateur, champs: ChampsPaquet): Promise<{ id: number; slug: string }> {
  const p = SchemaPaquet.safeParse({
    titre: champs.titre,
    description: champs.description || undefined,
  });
  if (!p.success) throw new ErreurMetier("TITRE_PAQUET");

  return tx(async (c) => {
    // Un paquet créé dans un dossier prend la matière de ce dossier.
    const dossier = await dossierDuFormulaire(champs.dossier, "deck", c);
    const matiere = dossier ? dossier.subject_id : await matiereDuFormulaire(champs.matiere, c);
    const nom = matiere === null ? "" : (await c.query<{ nom: string }>(
      `select nom from subject where id = $1`, [matiere])).rows[0].nom;
    const base = slugifier(`${nom}-${p.data.titre}`);
    let candidat = base;
    for (let n = 2; ; n++) {
      const pris = await c.query(`select 1 from deck where slug = $1`, [candidat]);
      if (pris.rowCount === 0) break;
      candidat = `${base.slice(0, 58)}-${n}`;
    }
    const d = await c.query<{ id: number }>(
      `insert into deck (slug, titre, subject_id, folder_id, chapitre, description, created_by)
       values ($1,$2,$3,$4,$5,$6,$7::uuid) returning id`,
      // La colonne chapitre (historique, non nulle) reprend le titre.
      [candidat, p.data.titre, matiere, dossier?.id ?? null, p.data.titre,
       p.data.description ?? null, u.id],
    );
    // Qui crée un paquet le suit : c'est lui qui va le remplir.
    await c.query(
      `insert into deck_subscription (user_id, deck_id) values ($1::uuid, $2)`,
      [u.id, d.rows[0].id],
    );
    return { id: d.rows[0].id, slug: candidat };
  });
}

/**
 * Modifie titre, description et matière d'un paquet : son créateur ou
 * un administrateur. Le slug ne change pas, les liens restent valides.
 */
export async function modifierPaquetPour(u: Utilisateur, deckId: number, champs: ChampsPaquet): Promise<void> {
  exigerId(deckId, "PAQUET_INTROUVABLE");
  const p = SchemaPaquet.safeParse({ titre: champs.titre, description: champs.description ?? "" });
  if (!p.success) throw new ErreurMetier("TITRE_PAQUET");

  await tx(async (c) => {
    const d = await c.query<{ subject_id: number | null }>(
      `select subject_id from deck where id = $1 and archived_at is null
          and ($3::boolean or created_by = $2::uuid) for update`,
      [deckId, u.id, u.role === "admin"],
    );
    if (d.rowCount === 0) throw new ErreurMetier("NON_AUTORISE");
    // Une matière archivée reste acceptée si c'est déjà celle du paquet.
    const brut = String(champs.matiere ?? "").trim();
    const matiere = brut !== "" && Number(brut) === d.rows[0].subject_id
      ? d.rows[0].subject_id : await matiereDuFormulaire(brut, c);
    await c.query(
      `update deck set titre = $2, description = $3, subject_id = $4,
              folder_id = case when folder_id is not null and not exists (
                  select 1 from dossier f where f.id = deck.folder_id
                     and f.subject_id is not distinct from $4::smallint)
                then null else folder_id end
        where id = $1`,
      [deckId, p.data.titre, p.data.description || null, matiere],
    );
  });
}

/** Reclasse un paquet : son créateur ou un administrateur. */
export async function changerMatierePaquetPour(u: Utilisateur, deckId: number, matiere: unknown): Promise<void> {
  const id = await matiereDuFormulaire(matiere);
  // Le paquet quitte son dossier si celui-ci est dans une autre matière.
  const r = await query(
    `update deck set subject_id = $2,
            folder_id = case when folder_id is not null and not exists (
                select 1 from dossier f where f.id = deck.folder_id
                   and f.subject_id is not distinct from $2::smallint)
              then null else folder_id end
      where id = $1 and ($4::boolean or created_by = $3::uuid) returning id`,
    [deckId, id, u.id, u.role === "admin"],
  );
  if (r.length === 0) throw new ErreurMetier("NON_AUTORISE");
}

export async function ajouterCartePour(u: Utilisateur, deckId: number, recto: unknown, verso: unknown): Promise<{ cardId: number }> {
  exigerId(deckId, "PAQUET_INTROUVABLE");
  const p = SchemaCarte.safeParse({ recto, verso });
  if (!p.success) throw new ErreurMetier("CARTE_VIDE");
  const r = await queryOne<{ id: number }>(
    `insert into card (deck_id, recto, verso, author_id)
     select id, $2, $3, $4::uuid from deck where id = $1 and archived_at is null
     returning id`,
    [deckId, p.data.recto, p.data.verso, u.id],
  );
  if (!r) throw new ErreurMetier("PAQUET_INTROUVABLE");
  return { cardId: r.id };
}

/**
 * Modifie une carte. La révision précédente est conservée par le
 * trigger `card_revision_auto`, donc une correction est toujours
 * réversible et attribuable.
 */
export async function modifierCartePour(
  u: Utilisateur, cardId: number, recto: unknown, verso: unknown, motif: unknown,
): Promise<void> {
  exigerId(cardId, "CARTE_INTROUVABLE");
  const p = SchemaCarte.safeParse({ recto, verso });
  if (!p.success) throw new ErreurMetier("CARTE_VIDE");
  const raison = typeof motif === "string" ? motif.trim().slice(0, 200) : "";

  await tx(async (c) => {
    const avant = await c.query<{ recto: string; verso: string }>(
      `select recto, verso from card where id = $1 and deleted_at is null for update`,
      [cardId],
    );
    if (avant.rowCount === 0) throw new ErreurMetier("CARTE_INTROUVABLE");
    if (avant.rows[0].recto === p.data.recto && avant.rows[0].verso === p.data.verso) return;

    await c.query(
      `update card set recto = $2, verso = $3, updated_at = now() where id = $1`,
      [cardId, p.data.recto, p.data.verso],
    );
    // Révision explicite : elle porte l'auteur de la MODIFICATION,
    // là où le trigger d'insertion porte l'auteur d'origine.
    await c.query(
      `insert into card_revision (card_id, recto, verso, edited_by, motif)
       values ($1,$2,$3,$4::uuid,$5)`,
      [cardId, p.data.recto, p.data.verso, u.id, raison || null],
    );
  });
}

export async function signalerCartePour(u: Utilisateur, cardId: number, motif: unknown): Promise<void> {
  exigerId(cardId, "CARTE_INTROUVABLE");
  const texte = typeof motif === "string" ? motif.trim().slice(0, 500) : "";
  if (texte.length < 3) throw new ErreurMetier("MOTIF_TROP_COURT");
  const r = await query(
    `insert into card_report (card_id, reported_by, motif)
     select id, $2::uuid, $3 from card where id = $1 and deleted_at is null
     on conflict do nothing returning card_id`,
    [cardId, u.id, texte],
  );
  if (r.length === 0) {
    const existe = await queryOne(`select 1 from card where id = $1 and deleted_at is null`, [cardId]);
    if (!existe) throw new ErreurMetier("CARTE_INTROUVABLE");
  }
}

/** Suppression douce : l'auteur ou un admin seulement. */
export async function supprimerCartePour(u: Utilisateur, cardId: number): Promise<void> {
  exigerId(cardId, "CARTE_INTROUVABLE");
  const r = await query<{ id: number }>(
    `update card set deleted_at = now(), deleted_by = $2::uuid
      where id = $1 and deleted_at is null
        and ($3::boolean or author_id = $2::uuid)
      returning id`,
    [cardId, u.id, u.role === "admin"],
  );
  if (r.length === 0) throw new ErreurMetier("NON_AUTORISE");
}
