"use server";

import { revalidatePath } from "next/cache";
import { query, queryOne } from "./db";
import { ErreurMetier, messageFr } from "./errors";
import { exigerUtilisateur } from "./session";
import { JOURS_AVANT_PURGE, MATIERES } from "./constantes";
import type { Reponse } from "./actions";

function echec(err: unknown): { ok: false; erreur: string } {
  if (!(err instanceof ErreurMetier)) console.error(err);
  return { ok: false, erreur: messageFr(err) };
}

/**
 * Suppression douce. Seuls le déposant et un administrateur peuvent
 * supprimer ; le fichier reste 30 jours sur le disque, donc une
 * suppression accidentelle est réversible.
 */
export async function supprimerDocument(id: number): Promise<Reponse<undefined>> {
  try {
    const u = await exigerUtilisateur();
    const r = await query<{ id: number }>(
      `update document
          set deleted_at = now(), deleted_by = $2::uuid,
              purge_after = now() + ($3::int || ' days')::interval
        where id = $1 and deleted_at is null
          and ($4::boolean or uploaded_by = $2::uuid)
        returning id`,
      [id, u.id, JOURS_AVANT_PURGE, u.role === "admin"],
    );
    if (r.length === 0) throw new ErreurMetier("NON_AUTORISE");

    revalidatePath("/documents");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}

export async function restaurerDocument(id: number): Promise<Reponse<undefined>> {
  try {
    const u = await exigerUtilisateur();
    const r = await query<{ id: number }>(
      `update document set deleted_at = null, deleted_by = null, purge_after = null
        where id = $1 and deleted_at is not null
          and ($3::boolean or uploaded_by = $2::uuid)
        returning id`,
      [id, u.id, u.role === "admin"],
    );
    if (r.length === 0) throw new ErreurMetier("NON_AUTORISE");

    revalidatePath("/documents");
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}

/** Corrige le classement d'un document (matière, chapitre, tags). */
export async function reclasserDocument(
  id: number, matiere: string, chapitre: string, tags: string,
): Promise<Reponse<undefined>> {
  try {
    const u = await exigerUtilisateur();
    if (matiere && !(MATIERES as readonly string[]).includes(matiere)) {
      throw new ErreurMetier("TYPE_NON_AUTORISE");
    }
    const liste = tags.split(",").map((t) => t.trim().toLowerCase())
      .filter((t) => t && t.length <= 40).slice(0, 12);

    const r = await query<{ id: number }>(
      `update document set matiere = $2::matiere, chapitre = $3, tags = $4
        where id = $1 and deleted_at is null
          and ($6::boolean or uploaded_by = $5::uuid)
        returning id`,
      [id, matiere || null, chapitre.trim() || null, liste, u.id, u.role === "admin"],
    );
    if (r.length === 0) throw new ErreurMetier("NON_AUTORISE");

    revalidatePath("/documents");
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}

