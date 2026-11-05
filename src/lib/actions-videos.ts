"use server";

import { revalidatePath } from "next/cache";
import { unlink } from "node:fs/promises";
import { query, queryOne } from "./db";
import { ErreurMetier, messageFr } from "./errors";
import { exigerUtilisateur } from "./session";
import { listerCommentaires, type CommentaireVideo } from "./videos";
import { cheminVideo } from "./videos-rendu";
import type { Reponse } from "./actions";

function echec(err: unknown): { ok: false; erreur: string } {
  if (!(err instanceof ErreurMetier)) console.error(err);
  return { ok: false, erreur: messageFr(err) };
}

function idValide(id: unknown): number {
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) throw new ErreurMetier("VIDEO_INTROUVABLE");
  return id;
}

export async function aimerVideo(videoId: number, aime: boolean): Promise<Reponse<{ likes: number; aime: boolean }>> {
  try {
    const u = await exigerUtilisateur();
    const id = idValide(videoId);
    if (aime) {
      await query(`insert into video_like (user_id, video_id)
                   select $1::uuid, id from video where id = $2 and statut = 'pret'
                   on conflict do nothing`, [u.id, id]);
    } else {
      await query(`delete from video_like where user_id = $1::uuid and video_id = $2`, [u.id, id]);
    }
    const r = await queryOne<{ likes: number; aime: boolean }>(
      `select count(*)::int as likes, coalesce(bool_or(user_id = $2::uuid), false) as aime
         from video_like where video_id = $1`, [id, u.id]);
    return { ok: true, data: { likes: r?.likes ?? 0, aime: r?.aime ?? false } };
  } catch (err) { return echec(err); }
}

export async function marquerVue(videoId: number): Promise<void> {
  try {
    const u = await exigerUtilisateur();
    await query(`insert into video_vue (user_id, video_id)
                 select $1::uuid, id from video where id = $2 and statut = 'pret'
                 on conflict do nothing`, [u.id, idValide(videoId)]);
  } catch { /* une vue perdue n'a aucune importance */ }
}

export async function commentairesVideo(videoId: number): Promise<Reponse<CommentaireVideo[]>> {
  try {
    await exigerUtilisateur();
    return { ok: true, data: await listerCommentaires(idValide(videoId)) };
  } catch (err) { return echec(err); }
}

export async function commenterVideo(videoId: number, texte: string): Promise<Reponse<CommentaireVideo[]>> {
  try {
    const u = await exigerUtilisateur();
    const id = idValide(videoId);
    const t = String(texte ?? "").trim();
    if (!t || t.length > 500) throw new ErreurMetier("COMMENTAIRE_INVALIDE");
    const r = await query(`insert into video_commentaire (video_id, auteur, texte)
                           select id, $2::uuid, $3 from video where id = $1 and statut = 'pret'
                           returning id`, [id, u.id, t]);
    if (r.length === 0) throw new ErreurMetier("VIDEO_INTROUVABLE");
    return { ok: true, data: await listerCommentaires(id) };
  } catch (err) { return echec(err); }
}

export async function supprimerCommentaire(commentaireId: number): Promise<Reponse<CommentaireVideo[]>> {
  try {
    const u = await exigerUtilisateur();
    if (!Number.isSafeInteger(commentaireId) || commentaireId <= 0) throw new ErreurMetier("NON_AUTORISE");
    const r = await queryOne<{ video_id: number }>(
      `delete from video_commentaire c
        where c.id = $1 and ($3 or c.auteur = $2::uuid
                             or exists (select 1 from video v where v.id = c.video_id and v.auteur = $2::uuid))
        returning c.video_id`, [commentaireId, u.id, u.role === "admin"]);
    if (!r) throw new ErreurMetier("NON_AUTORISE");
    return { ok: true, data: await listerCommentaires(r.video_id) };
  } catch (err) { return echec(err); }
}

/** L'auteur ou un administrateur ; les fichiers partent tout de suite. */
export async function supprimerVideo(videoId: number): Promise<Reponse> {
  try {
    const u = await exigerUtilisateur();
    const r = await queryOne<{ sources: string[]; storage_name: string | null; poster_name: string | null }>(
      `delete from video where id = $1 and (auteur = $2::uuid or $3)
        returning sources, storage_name, poster_name`, [idValide(videoId), u.id, u.role === "admin"]);
    if (!r) throw new ErreurMetier("NON_AUTORISE");
    for (const n of [...r.sources, r.storage_name, r.poster_name]) {
      if (n) await unlink(cheminVideo(n)).catch(() => {});
    }
    revalidatePath("/divertissement/videos");
    return { ok: true };
  } catch (err) { return echec(err); }
}
