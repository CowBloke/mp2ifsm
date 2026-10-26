"use server";

import { revalidatePath } from "next/cache";
import type { PoolClient } from "pg";
import { tx } from "./db";
import { ErreurMetier, messageFr } from "./errors";
import { exigerUtilisateur, type Utilisateur } from "./session";
import { NOM_DOSSIER_MAX, PROFONDEUR_MAX_DOSSIERS, type KindDossier } from "./constantes";
import { chemin, descendants, hauteur } from "./arbre-dossiers";
import { matiereDuFormulaire } from "./matieres";
import type { Reponse } from "./actions";

/*
 * Dossiers de documents et de paquets.
 *
 * N'importe quel membre crée un dossier ; le renommer, le déplacer ou
 * le supprimer revient à son créateur et aux administrateurs (même
 * règle que pour reclasser un paquet ou un document). Supprimer un
 * dossier ne supprime jamais son contenu : il remonte d'un niveau.
 *
 * Les modifications de l'arbre prennent un verrou global : deux
 * déplacements simultanés ne peuvent donc pas former un cycle.
 */

type Ligne = {
  id: number; kind: KindDossier; parent_id: number | null;
  subject_id: number | null; nom: string; created_by: string;
};

function echec(err: unknown): { ok: false; erreur: string } {
  // 23505 : un frère porte déjà ce nom (index dossier_nom_key).
  if ((err as { code?: string })?.code === "23505") err = new ErreurMetier("DOSSIER_EXISTANT");
  if (!(err instanceof ErreurMetier)) console.error(err);
  return { ok: false, erreur: messageFr(err) };
}

function rafraichir() {
  revalidatePath("/fiches");
  revalidatePath("/documents");
  revalidatePath("/");
}

async function verrouiller(c: PoolClient) {
  await c.query("select pg_advisory_xact_lock(hashtextextended('dossiers', 0))");
}

const COLONNES = "id, kind, parent_id, subject_id, nom, created_by::text as created_by";

async function tousLesDossiers(c: PoolClient, kind: KindDossier): Promise<Ligne[]> {
  return (await c.query<Ligne>(`select ${COLONNES} from dossier where kind = $1`, [kind])).rows;
}

async function charger(c: PoolClient, id: unknown): Promise<Ligne> {
  const n = Number(id);
  if (!Number.isSafeInteger(n) || n <= 0) throw new ErreurMetier("DOSSIER_INTROUVABLE");
  const r = await c.query<Ligne>(`select ${COLONNES} from dossier where id = $1`, [n]);
  if (r.rows.length === 0) throw new ErreurMetier("DOSSIER_INTROUVABLE");
  return r.rows[0];
}

/** Dossier de destination optionnel (null = racine / aucun dossier). */
async function chargerOptionnel(c: PoolClient, id: number | null, kind: KindDossier) {
  if (id === null) return null;
  const d = await charger(c, id);
  if (d.kind !== kind) throw new ErreurMetier("DOSSIER_INTROUVABLE");
  return d;
}

function peutModifier(d: Ligne, u: Utilisateur) {
  if (u.role !== "admin" && d.created_by !== u.id) throw new ErreurMetier("NON_AUTORISE");
}

function nomValide(brut: unknown): string {
  const nom = String(brut ?? "").replace(/[\x00-\x1f\x7f]/g, "").replace(/\s+/g, " ").trim();
  if (nom.length < 1 || nom.length > NOM_DOSSIER_MAX) throw new ErreurMetier("DOSSIER_NOM_INVALIDE");
  return nom;
}

function kindValide(kind: unknown): KindDossier {
  if (kind !== "document" && kind !== "deck") throw new ErreurMetier("DOSSIER_INTROUVABLE");
  return kind;
}

/**
 * Applique une matière à un dossier, à ses sous-dossiers et à ce qu'ils
 * contiennent. Un paquet suit toujours son dossier (c'est ce qui le
 * range dans la bonne matière) ; un document garde la sienne si le
 * dossier n'en a pas.
 */
async function propagerMatiere(c: PoolClient, kind: KindDossier, ids: number[], matiere: number | null) {
  await c.query(`update dossier set subject_id = $2 where id = any($1::bigint[])`, [ids, matiere]);
  if (kind === "deck") {
    await c.query(`update deck set subject_id = $2 where folder_id = any($1::bigint[])`, [ids, matiere]);
  } else if (matiere !== null) {
    await c.query(`update document set subject_id = $2 where folder_id = any($1::bigint[])`, [ids, matiere]);
  }
}

/** Crée un dossier. Sous un parent, la matière est celle du parent. */
export async function creerDossier(
  kind: KindDossier, parentId: number | null, nom: string, matiere?: string,
): Promise<Reponse<{ id: number }>> {
  try {
    const u = await exigerUtilisateur();
    const k = kindValide(kind);
    const propre = nomValide(nom);

    const id = await tx(async (c) => {
      await verrouiller(c);
      const parent = await chargerOptionnel(c, parentId ?? null, k);
      let sujet: number | null;
      if (parent) {
        const profondeur = chemin(await tousLesDossiers(c, k), parent.id).length;
        if (profondeur + 1 > PROFONDEUR_MAX_DOSSIERS) throw new ErreurMetier("DOSSIER_TROP_PROFOND");
        sujet = parent.subject_id;
      } else {
        sujet = await matiereDuFormulaire(matiere, c);
      }
      const r = await c.query<{ id: number }>(
        `insert into dossier (kind, parent_id, subject_id, nom, created_by)
         values ($1,$2,$3,$4,$5::uuid) returning id`,
        [k, parent?.id ?? null, sujet, propre, u.id],
      );
      return r.rows[0].id;
    });

    rafraichir();
    return { ok: true, data: { id } };
  } catch (err) {
    return echec(err);
  }
}

/**
 * Renomme un dossier. Pour un dossier racine, `matiere` (id, "" = sans
 * matière) le range dans une autre matière avec tout son contenu ;
 * `undefined` la laisse telle quelle.
 */
export async function modifierDossier(
  id: number, nom: string, matiere?: string,
): Promise<Reponse<undefined>> {
  try {
    const u = await exigerUtilisateur();
    const propre = nomValide(nom);

    await tx(async (c) => {
      await verrouiller(c);
      const d = await charger(c, id);
      peutModifier(d, u);

      if (d.parent_id === null && matiere !== undefined) {
        const sujet = await matiereDuFormulaire(matiere, c);
        if (sujet !== d.subject_id) {
          const tous = await tousLesDossiers(c, d.kind);
          await propagerMatiere(c, d.kind, [d.id, ...descendants(tous, d.id)], sujet);
        }
      }
      await c.query(`update dossier set nom = $2 where id = $1`, [d.id, propre]);
    });

    rafraichir();
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}

/** Déplace un dossier (null = à la racine). */
export async function deplacerDossier(
  id: number, parentId: number | null,
): Promise<Reponse<undefined>> {
  try {
    const u = await exigerUtilisateur();

    await tx(async (c) => {
      await verrouiller(c);
      const d = await charger(c, id);
      peutModifier(d, u);
      const parent = await chargerOptionnel(c, parentId ?? null, d.kind);
      const tous = await tousLesDossiers(c, d.kind);

      if (parent && (parent.id === d.id || descendants(tous, d.id).has(parent.id))) {
        throw new ErreurMetier("DOSSIER_CYCLE");
      }
      const niveauParent = parent ? chemin(tous, parent.id).length : 0;
      if (niveauParent + hauteur(tous, d.id) > PROFONDEUR_MAX_DOSSIERS) {
        throw new ErreurMetier("DOSSIER_TROP_PROFOND");
      }

      if (parent && parent.subject_id !== d.subject_id) {
        await propagerMatiere(c, d.kind, [d.id, ...descendants(tous, d.id)], parent.subject_id);
      }
      await c.query(`update dossier set parent_id = $2 where id = $1`, [d.id, parent?.id ?? null]);
    });

    rafraichir();
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}

/**
 * Supprime un dossier. Ses sous-dossiers et ses éléments ne sont pas
 * supprimés : ils remontent chez le parent (ou à la racine).
 */
export async function supprimerDossier(id: number): Promise<Reponse<undefined>> {
  try {
    const u = await exigerUtilisateur();

    await tx(async (c) => {
      await verrouiller(c);
      const d = await charger(c, id);
      peutModifier(d, u);

      await c.query(`update dossier set parent_id = $2 where parent_id = $1`, [d.id, d.parent_id]);
      await c.query(`update deck set folder_id = $2 where folder_id = $1`, [d.id, d.parent_id]);
      await c.query(`update document set folder_id = $2 where folder_id = $1`, [d.id, d.parent_id]);
      await c.query(`delete from dossier where id = $1`, [d.id]);
    });

    rafraichir();
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}

/** Range un document dans un dossier (null = hors dossier). */
export async function classerDocument(
  docId: number, dossierId: number | null,
): Promise<Reponse<undefined>> {
  try {
    const u = await exigerUtilisateur();

    await tx(async (c) => {
      const dossier = await chargerOptionnel(c, dossierId ?? null, "document");
      const r = await c.query(
        `update document
            set folder_id = $2, subject_id = coalesce($3::smallint, subject_id)
          where id = $1 and deleted_at is null
            and ($5::boolean or uploaded_by = $4::uuid)
          returning id`,
        [docId, dossier?.id ?? null, dossier?.subject_id ?? null, u.id, u.role === "admin"],
      );
      if (r.rowCount === 0) throw new ErreurMetier("NON_AUTORISE");
    });

    revalidatePath("/documents");
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}

/** Range un paquet dans un dossier : il prend la matière du dossier. */
export async function classerPaquet(
  deckId: number, dossierId: number | null,
): Promise<Reponse<undefined>> {
  try {
    const u = await exigerUtilisateur();

    await tx(async (c) => {
      const dossier = await chargerOptionnel(c, dossierId ?? null, "deck");
      const r = await c.query(
        `update deck
            set folder_id = $2,
                subject_id = case when $2::bigint is null then subject_id else $3::smallint end
          where id = $1 and archived_at is null
            and ($5::boolean or created_by = $4::uuid)
          returning id`,
        [deckId, dossier?.id ?? null, dossier?.subject_id ?? null, u.id, u.role === "admin"],
      );
      if (r.rowCount === 0) throw new ErreurMetier("NON_AUTORISE");
    });

    rafraichir();
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}
