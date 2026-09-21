"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { ErreurMetier, messageFr } from "./errors";
import { exigerUtilisateur, reporterDemandeGroupe } from "./session";
import { groupeValide } from "./colloscope";
import type { Reponse } from "./actions";

function echec(err: unknown): { ok: false; erreur: string } {
  if (!(err instanceof ErreurMetier)) console.error(err);
  return { ok: false, erreur: messageFr(err) };
}

/** Enregistre (ou retire, avec null) le groupe de colles du membre. */
export async function definirGroupe(groupe: number | null): Promise<Reponse<{ groupe: number | null }>> {
  try {
    const u = await exigerUtilisateur();
    if (groupe !== null && !groupeValide(groupe)) throw new ErreurMetier("GROUPE_INVALIDE");
    await query(`update app_user set groupe_colle = $2 where id = $1::uuid`, [u.id, groupe]);
    revalidatePath("/", "layout");
    return { ok: true, data: { groupe } };
  } catch (err) {
    return echec(err);
  }
}

/** « Plus tard » : la demande revient à la prochaine connexion. */
export async function reporterGroupe(): Promise<Reponse<undefined>> {
  try {
    await exigerUtilisateur();
    await reporterDemandeGroupe();
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}
