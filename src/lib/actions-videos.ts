"use server";

import { revalidatePath } from "next/cache";
import { unlink } from "node:fs/promises";
import { query, queryOne } from "./db";
import { ErreurMetier, messageFr } from "./errors";
import { exigerUtilisateur } from "./session";
import {
  aimerVideoPour, ajouterCommentaire, enregistrerVue, idVideo, listerCommentaires, retirerCommentaire,
  type CommentaireVideo,
} from "./videos";
import { cheminVideo } from "./videos-rendu";
import type { Reponse } from "./actions";

function echec(err: unknown): { ok: false; erreur: string } {
  if (!(err instanceof ErreurMetier)) console.error(err);
  return { ok: false, erreur: messageFr(err) };
}


export async function aimerVideo(videoId: number, aime: boolean): Promise<Reponse<{ likes: number; aime: boolean }>> {
  try {
    return { ok: true, data: await aimerVideoPour(await exigerUtilisateur(), videoId, aime) };
  } catch (err) { return echec(err); }
}

export async function marquerVue(videoId: number): Promise<void> {
  try {
    await enregistrerVue(await exigerUtilisateur(), videoId);
  } catch { /* une vue perdue n'a aucune importance */ }
}

export async function commentairesVideo(videoId: number): Promise<Reponse<CommentaireVideo[]>> {
  try {
    await exigerUtilisateur();
    return { ok: true, data: await listerCommentaires(idVideo(videoId)) };
  } catch (err) { return echec(err); }
}

export async function commenterVideo(videoId: number, texte: string): Promise<Reponse<CommentaireVideo[]>> {
  try {
    return { ok: true, data: await ajouterCommentaire(await exigerUtilisateur(), videoId, texte) };
  } catch (err) { return echec(err); }
}

export async function supprimerCommentaire(commentaireId: number): Promise<Reponse<CommentaireVideo[]>> {
  try {
    return { ok: true, data: await retirerCommentaire(await exigerUtilisateur(), commentaireId) };
  } catch (err) { return echec(err); }
}

/** L'auteur ou un administrateur ; les fichiers partent tout de suite. */
export async function supprimerVideo(videoId: number): Promise<Reponse> {
  try {
    const u = await exigerUtilisateur();
    const r = await queryOne<{ sources: string[]; storage_name: string | null; poster_name: string | null }>(
      `delete from video where id = $1 and (auteur = $2::uuid or $3)
        returning sources, storage_name, poster_name`, [idVideo(videoId), u.id, u.role === "admin"]);
    if (!r) throw new ErreurMetier("NON_AUTORISE");
    for (const n of [...r.sources, r.storage_name, r.poster_name]) {
      if (n) await unlink(cheminVideo(n)).catch(() => {});
    }
    revalidatePath("/divertissement/videos", "layout");
    return { ok: true };
  } catch (err) { return echec(err); }
}
