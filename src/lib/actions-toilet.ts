"use server";

import { revalidatePath } from "next/cache";
import { ErreurMetier, messageFr } from "./errors";
import { exigerUtilisateur } from "./session";
import { activerToiletPour, supprimerPassagePour } from "./toilet";
import type { Reponse } from "./actions";

function echec(err: unknown): { ok: false; erreur: string } {
  if (!(err instanceof ErreurMetier)) console.error(err);
  return { ok: false, erreur: messageFr(err) };
}

/** Inscrit le membre courant si le code du lien secret est le bon. */
export async function activerToilet(code: string): Promise<Reponse> {
  try {
    await activerToiletPour(await exigerUtilisateur(), code);
    revalidatePath("/divertissement");
    return { ok: true };
  } catch (err) { return echec(err); }
}

/** Le membre lui-même (fausse manip) ou un administrateur. */
export async function supprimerPassage(passageId: number): Promise<Reponse> {
  try {
    await supprimerPassagePour(await exigerUtilisateur(), passageId);
    revalidatePath("/toilet");
    return { ok: true };
  } catch (err) { return echec(err); }
}
