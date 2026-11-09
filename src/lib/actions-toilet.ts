"use server";

import { revalidatePath } from "next/cache";
import { timingSafeEqual } from "node:crypto";
import { query, queryOne } from "./db";
import { ErreurMetier, messageFr } from "./errors";
import { exigerUtilisateur } from "./session";
import { supprimerDuDisque } from "./stockage";
import { DOSSIER_PHOTOS_TOILET, codeInvitation, estMembreToilet } from "./toilet";
import type { Reponse } from "./actions";

function echec(err: unknown): { ok: false; erreur: string } {
  if (!(err instanceof ErreurMetier)) console.error(err);
  return { ok: false, erreur: messageFr(err) };
}

function memeCode(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Inscrit le membre courant si le code du lien secret est le bon. */
export async function activerToilet(code: string): Promise<Reponse> {
  try {
    const u = await exigerUtilisateur();
    const attendu = await codeInvitation();
    if (!attendu || typeof code !== "string" || !memeCode(code, attendu)) {
      throw new ErreurMetier("TOILET_LIEN_INVALIDE");
    }
    await query(`insert into toilet_membre (user_id) values ($1::uuid) on conflict do nothing`, [u.id]);
    revalidatePath("/divertissement");
    return { ok: true };
  } catch (err) { return echec(err); }
}

/** Le membre lui-même (fausse manip) ou un administrateur. */
export async function supprimerPassage(passageId: number): Promise<Reponse> {
  try {
    const u = await exigerUtilisateur();
    if (!(await estMembreToilet(u.id))) throw new ErreurMetier("NON_AUTORISE");
    if (!Number.isSafeInteger(passageId) || passageId <= 0) throw new ErreurMetier("NON_AUTORISE");
    const r = await queryOne<{ storage_name: string | null }>(
      `delete from toilet_passage where id = $1 and (user_id = $2::uuid or $3)
        returning storage_name`, [passageId, u.id, u.role === "admin"]);
    if (!r) throw new ErreurMetier("NON_AUTORISE");
    if (r.storage_name) await supprimerDuDisque(DOSSIER_PHOTOS_TOILET, r.storage_name).catch(console.error);
    revalidatePath("/toilet");
    return { ok: true };
  } catch (err) { return echec(err); }
}
