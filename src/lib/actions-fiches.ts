"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { partagerStatsPour } from "./profil";
import { ErreurMetier, messageFr } from "./errors";
import { exigerAdmin, exigerUtilisateur } from "./session";
import {
  abonnerPaquet, aimerPaquetPour, carteRendue, enregistrerRevision,
  type CarteRendue, type ResultatRevision,
} from "./revision";
import {
  ajouterCartePour, changerMatierePaquetPour, creerPaquetPour, modifierCartePour,
  modifierPaquetPour, signalerCartePour, supprimerCartePour,
} from "./cartes";
import type { Reponse } from "./actions";

export type { CarteRendue, ResultatRevision };

function echec(err: unknown): { ok: false; erreur: string } {
  if (!(err instanceof ErreurMetier)) console.error(err);
  return { ok: false, erreur: messageFr(err) };
}

/* ------------------------------------------------------------------ */
/* Révision                                                            */
/* ------------------------------------------------------------------ */


/**
 * Enregistre une révision.
 *
 * Lecture de l'état, calcul FSRS et écriture se font dans UNE
 * transaction, avec verrou de ligne : deux onglets ouverts sur la même
 * carte ne peuvent pas produire deux planifications divergentes. Le
 * client envoie seulement la note ; il ne calcule aucune date.
 */
export async function reviserCarte(
  cardId: number,
  cleNote: string,
  jeton: string,
  dureeMs?: number,
): Promise<Reponse<ResultatRevision>> {
  try {
    const data = await enregistrerRevision(await exigerUtilisateur(), cardId, cleNote, jeton, dureeMs);
    return { ok: true, data };
  } catch (err) {
    return echec(err);
  }
}

/* ------------------------------------------------------------------ */
/* Paquets                                                             */
/* ------------------------------------------------------------------ */

export async function creerPaquet(formData: FormData): Promise<Reponse<{ slug: string }>> {
  try {
    const { slug } = await creerPaquetPour(await exigerUtilisateur(), {
      titre: formData.get("titre"), description: formData.get("description"),
      matiere: formData.get("matiere"), dossier: formData.get("dossier"),
    });
    revalidatePath("/fiches");
    return { ok: true, data: { slug } };
  } catch (err) {
    return echec(err);
  }
}

/**
 * Suivre ou ne plus suivre un paquet. Se désabonner ne touche ni
 * card_state ni review_log : un réabonnement reprend la planification
 * exactement là où elle en était.
 */
export async function suivrePaquet(
  deckId: number,
  suivre: boolean,
): Promise<Reponse<{ abonne: boolean }>> {
  try {
    await abonnerPaquet(await exigerUtilisateur(), deckId, suivre);
    revalidatePath("/fiches");
    revalidatePath("/");
    return { ok: true, data: { abonne: suivre } };
  } catch (err) {
    return echec(err);
  }
}

/** Reclasse un paquet : son créateur ou un administrateur. */
export async function changerMatierePaquet(
  deckId: number,
  matiere: string,
): Promise<Reponse<undefined>> {
  try {
    await changerMatierePaquetPour(await exigerUtilisateur(), deckId, matiere);
    revalidatePath("/fiches");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}

/** Modifie titre, description et matière d'un paquet : son créateur ou un administrateur. */
export async function modifierPaquet(
  deckId: number,
  formData: FormData,
): Promise<Reponse<undefined>> {
  try {
    await modifierPaquetPour(await exigerUtilisateur(), deckId, {
      titre: formData.get("titre"), description: formData.get("description") ?? "",
      matiere: formData.get("matiere"),
    });
    revalidatePath("/fiches");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}

/** « J'aime » sur un paquet, un par membre. */
export async function aimerPaquet(
  deckId: number,
  aime: boolean,
): Promise<Reponse<{ likes: number; aime: boolean }>> {
  try {
    const data = await aimerPaquetPour(await exigerUtilisateur(), deckId, aime);
    revalidatePath("/fiches");
    return { ok: true, data };
  } catch (err) {
    return echec(err);
  }
}

/* ------------------------------------------------------------------ */
/* Cartes — n'importe qui peut en ajouter, tout est tracé              */
/* ------------------------------------------------------------------ */

export async function ajouterCarte(
  deckId: number,
  recto: string,
  verso: string,
): Promise<Reponse<{ cardId: number }>> {
  try {
    const data = await ajouterCartePour(await exigerUtilisateur(), deckId, recto, verso);
    revalidatePath("/fiches");
    return { ok: true, data };
  } catch (err) {
    return echec(err);
  }
}

/** Modifie une carte ; la version précédente reste dans l'historique. */
export async function modifierCarte(
  cardId: number,
  recto: string,
  verso: string,
  motif: string,
): Promise<Reponse<undefined>> {
  try {
    await modifierCartePour(await exigerUtilisateur(), cardId, recto, verso, motif);
    revalidatePath("/fiches");
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}

export async function signalerCarte(cardId: number, motif: string): Promise<Reponse<undefined>> {
  try {
    await signalerCartePour(await exigerUtilisateur(), cardId, motif);
    revalidatePath("/fiches");
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}

export async function resoudreSignalement(reportId: number): Promise<Reponse<undefined>> {
  try {
    const u = await exigerAdmin();
    await query(
      `update card_report set resolved_at = now(), resolved_by = $2::uuid
        where id = $1 and resolved_at is null`,
      [reportId, u.id],
    );
    revalidatePath("/fiches");
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}

/** Suppression douce : l'auteur ou un admin seulement. */
export async function supprimerCarte(cardId: number): Promise<Reponse<undefined>> {
  try {
    await supprimerCartePour(await exigerUtilisateur(), cardId);
    revalidatePath("/fiches");
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}

/** Partage des statistiques dans la heatmap de classe (opt-in). */
export async function basculerPartageStats(actif: boolean): Promise<Reponse<{ actif: boolean }>> {
  try {
    await partagerStatsPour(await exigerUtilisateur(), actif);
    revalidatePath("/profil");
    revalidatePath("/fiches");
    return { ok: true, data: { actif } };
  } catch (err) {
    return echec(err);
  }
}

/* ------------------------------------------------------------------ */
/* Session de révision                                                 */
/* ------------------------------------------------------------------ */

/** Carte suivante de la session, déjà composée (voir `carteRendue`). */
export async function carteSuivante(
  deckId: number | null,
  exclure: number[] = [],
): Promise<Reponse<CarteRendue | null>> {
  try {
    return { ok: true, data: await carteRendue(await exigerUtilisateur(), deckId, exclure) };
  } catch (err) {
    return echec(err);
  }
}

/**
 * Aperçu d'un contenu de carte (LaTeX composé, images résolues).
 * Permet de vérifier une formule avant d'enregistrer, sans embarquer
 * KaTeX dans le navigateur.
 */
export async function previsualiser(source: string): Promise<Reponse<{ html: string }>> {
  try {
    await exigerUtilisateur();
    const { rendreContenu } = await import("./rendu");
    return { ok: true, data: { html: rendreContenu(source.slice(0, 8000)) } };
  } catch (err) {
    return echec(err);
  }
}

export type RevisionRendue = {
  id: number; auteur: string; edited_at: string; motif: string | null;
  rectoHtml: string; versoHtml: string;
};

/** Historique d'une carte, chargé à la demande. */
export async function historiqueCarteAction(
  cardId: number,
): Promise<Reponse<RevisionRendue[]>> {
  try {
    await exigerUtilisateur();
    const { historiqueCarte } = await import("./fiches");
    const { rendreContenu } = await import("./rendu");
    const lignes = await historiqueCarte(cardId);
    return {
      ok: true,
      data: lignes.map((r) => ({
        id: r.id, auteur: r.auteur, edited_at: r.edited_at, motif: r.motif,
        rectoHtml: rendreContenu(r.recto), versoHtml: rendreContenu(r.verso),
      })),
    };
  } catch (err) {
    return echec(err);
  }
}
