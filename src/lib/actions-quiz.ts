"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ErreurMetier, messageFr } from "./errors";
import { exigerUtilisateur } from "./session";
import { commencerTentative, enregistrerQuiz, repondre, retirerQuiz, type Correction } from "./quiz";
import { verifierQuiz } from "./quiz-commun";
import type { Reponse } from "./actions";

/* Actions du quiz : la logique vit dans quiz.ts. */

function echec(err: unknown): { ok: false; erreur: string } {
  if (!(err instanceof ErreurMetier)) console.error(err);
  return { ok: false, erreur: messageFr(err) };
}

export async function sauverQuiz(id: number | null, brut: unknown): Promise<Reponse<{ id: number }>> {
  try {
    const u = await exigerUtilisateur();
    const v = verifierQuiz(brut);
    if (!v.ok) return { ok: false, erreur: v.erreur };
    const quizId = await enregistrerQuiz(u, id, v.quiz);
    revalidatePath("/divertissement/quiz");
    return { ok: true, data: { id: quizId } };
  } catch (err) {
    return echec(err);
  }
}

export async function supprimerQuiz(id: number): Promise<Reponse<undefined>> {
  try {
    await retirerQuiz(await exigerUtilisateur(), id);
    revalidatePath("/divertissement/quiz");
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}

/** Bouton « Commencer » : crée (ou reprend) la tentative puis ouvre le jeu. */
export async function lancerQuiz(id: number): Promise<Reponse<undefined>> {
  try {
    await commencerTentative(await exigerUtilisateur(), id);
  } catch (err) {
    return echec(err);
  }
  redirect(`/divertissement/quiz/${id}/jouer`);
}

export async function repondreQuestion(
  tentativeId: number, questionId: number, choix: number[],
): Promise<Reponse<Correction>> {
  try {
    return { ok: true, data: await repondre(await exigerUtilisateur(), tentativeId, questionId, choix) };
  } catch (err) {
    return echec(err);
  }
}
