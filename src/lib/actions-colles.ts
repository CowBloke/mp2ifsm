"use server";

import { revalidatePath } from "next/cache";
import { ErreurMetier, messageFr } from "./errors";
import { exigerUtilisateur, reporterDemandeGroupe } from "./session";
import { enregistrerGroupe } from "./colles";
import type { Reponse } from "./actions";

function echec(err: unknown): { ok: false; erreur: string } {
  if (!(err instanceof ErreurMetier)) console.error(err);
  return { ok: false, erreur: messageFr(err) };
}

/** Enregistre (ou retire, avec null) le groupe de colles du membre. */
export async function definirGroupe(groupe: number | null): Promise<Reponse<{ groupe: number | null }>> {
  try {
    await enregistrerGroupe(await exigerUtilisateur(), groupe);
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
