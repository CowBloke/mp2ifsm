"use server";

import { revalidatePath } from "next/cache";
import { ErreurMetier, messageFr } from "./errors";
import { exigerUtilisateur } from "./session";
import { corrigerEcheance, creerEcheance, retirerEcheance, type ChampsEcheance } from "./echeances";
import type { Reponse } from "./actions";

/* Actions du site : la logique vit dans echeances.ts, partagée avec l'API de l'app. */

function champs(formData: FormData): ChampsEcheance {
  return {
    titre: formData.get("titre"), matiere: formData.get("matiere"),
    dueAt: formData.get("dueAt"), details: formData.get("details"),
  };
}

function echec(err: unknown): { ok: false; erreur: string } {
  if (!(err instanceof ErreurMetier)) console.error(err);
  return { ok: false, erreur: messageFr(err) };
}

export async function ajouterEcheance(formData: FormData): Promise<Reponse<undefined>> {
  try {
    await creerEcheance(await exigerUtilisateur(), champs(formData));
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}

export async function modifierEcheance(id: number, formData: FormData): Promise<Reponse<undefined>> {
  try {
    await exigerUtilisateur();
    await corrigerEcheance(id, champs(formData));
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}

export async function supprimerEcheance(id: number): Promise<Reponse<undefined>> {
  try {
    await retirerEcheance(await exigerUtilisateur(), id);
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}
