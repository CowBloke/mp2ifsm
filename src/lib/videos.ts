import "server-only";
import { query, queryOne } from "./db";
import { ErreurMetier } from "./errors";
import type { Utilisateur } from "./session";
import type { CouleurMatiere } from "./constantes";

export type VideoVue = {
  id: number;
  titre: string;
  description: string;
  auteur_id: string;
  auteur: string;
  matiere_id: number | null;
  matiere: string | null;
  couleur: CouleurMatiere | null;
  duree_ms: number;
  likes: number;
  aime: boolean;
  vues: number;
  commentaires: number;
  /** Titre de la musique ajoutée au montage, s'il y en a une. */
  musique: string | null;
  created_at: string;
};

export type VideoEnCours = { id: number; titre: string; statut: "traitement" | "echec"; created_at: string };

export type CommentaireVideo = {
  id: number; auteur_id: string; auteur: string; texte: string; created_at: string;
};

export type FiltreVideos = { matiere?: number | null; auteur?: string | null };

/** Vidéos prêtes, les plus récentes d'abord (la classe en publie peu). */
export async function listerVideos(userId: string, filtre: FiltreVideos = {}): Promise<VideoVue[]> {
  return query<VideoVue>(
    `select v.id, v.titre, v.description, v.auteur as auteur_id, u.display_name as auteur,
            v.subject_id as matiere_id, s.nom as matiere, s.couleur, coalesce(v.duree_ms, 0) as duree_ms,
            (select count(*)::int from video_like l where l.video_id = v.id) as likes,
            exists (select 1 from video_like l where l.video_id = v.id and l.user_id = $1::uuid) as aime,
            (select count(*)::int from video_vue w where w.video_id = v.id) as vues,
            (select count(*)::int from video_commentaire c where c.video_id = v.id) as commentaires,
            v.montage->'musique'->>'titre' as musique,
            v.created_at::text
       from video v
       join app_user u on u.id = v.auteur
       left join subject s on s.id = v.subject_id
      where v.statut = 'pret'
        and ($2::smallint is null or v.subject_id = $2)
        and ($3::uuid is null or v.auteur = $3::uuid)
      order by v.created_at desc
      limit 300`, [userId, filtre.matiere ?? null, filtre.auteur ?? null]);
}

export type ProfilVideos = { id: string; pseudo: string; videos: number; likes: number; vues: number };

/** En-tête du profil d'un membre ; null si le compte n'existe pas. */
export async function profilVideos(auteur: string): Promise<ProfilVideos | null> {
  if (!/^[0-9a-f-]{36}$/i.test(auteur)) return null;
  const r = await query<ProfilVideos>(
    `select u.id, u.display_name as pseudo,
            (select count(*)::int from video v where v.auteur = u.id and v.statut = 'pret') as videos,
            (select count(*)::int from video_like l join video v on v.id = l.video_id
              where v.auteur = u.id and v.statut = 'pret') as likes,
            (select count(*)::int from video_vue w join video v on v.id = w.video_id
              where v.auteur = u.id and v.statut = 'pret') as vues
       from app_user u where u.id = $1::uuid`, [auteur]);
  return r[0] ?? null;
}

/** Lit ?matiere= et ?auteur= d'une URL du fil. */
export function lireFiltre(p: { matiere?: string; auteur?: string }): FiltreVideos {
  const m = Number(p.matiere);
  return {
    matiere: Number.isSafeInteger(m) && m > 0 ? m : null,
    auteur: p.auteur && /^[0-9a-f-]{36}$/i.test(p.auteur) ? p.auteur : null,
  };
}

/** Vidéos du membre encore en montage ou en échec. */
export async function mesVideosEnCours(userId: string): Promise<VideoEnCours[]> {
  return query<VideoEnCours>(
    `select id, titre, statut, created_at::text from video
      where auteur = $1::uuid and statut <> 'pret' order by created_at desc`, [userId]);
}

export async function listerCommentaires(videoId: number): Promise<CommentaireVideo[]> {
  return query<CommentaireVideo>(
    `select c.id, c.auteur as auteur_id, u.display_name as auteur, c.texte, c.created_at::text
       from video_commentaire c join app_user u on u.id = c.auteur
      where c.video_id = $1 order by c.created_at desc limit 300`, [videoId]);
}

/* Écritures du fil, partagées par les actions du site et l'API de l'app. */

export function idVideo(id: unknown): number {
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) throw new ErreurMetier("VIDEO_INTROUVABLE");
  return id;
}

export async function aimerVideoPour(u: Utilisateur, videoId: number, aime: boolean): Promise<{ likes: number; aime: boolean }> {
  const id = idVideo(videoId);
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
  return { likes: r?.likes ?? 0, aime: r?.aime ?? false };
}

export async function enregistrerVue(u: Utilisateur, videoId: number): Promise<void> {
  await query(`insert into video_vue (user_id, video_id)
               select $1::uuid, id from video where id = $2 and statut = 'pret'
               on conflict do nothing`, [u.id, idVideo(videoId)]);
}

export async function ajouterCommentaire(u: Utilisateur, videoId: number, texte: unknown): Promise<CommentaireVideo[]> {
  const id = idVideo(videoId);
  const t = String(texte ?? "").trim();
  if (!t || t.length > 500) throw new ErreurMetier("COMMENTAIRE_INVALIDE");
  const r = await query(`insert into video_commentaire (video_id, auteur, texte)
                         select id, $2::uuid, $3 from video where id = $1 and statut = 'pret'
                         returning id`, [id, u.id, t]);
  if (r.length === 0) throw new ErreurMetier("VIDEO_INTROUVABLE");
  return listerCommentaires(id);
}

/** Par son auteur, l'auteur de la vidéo ou un admin. */
export async function retirerCommentaire(u: Utilisateur, commentaireId: number): Promise<CommentaireVideo[]> {
  if (!Number.isSafeInteger(commentaireId) || commentaireId <= 0) throw new ErreurMetier("NON_AUTORISE");
  const r = await queryOne<{ video_id: number }>(
    `delete from video_commentaire c
      where c.id = $1 and ($3 or c.auteur = $2::uuid
                           or exists (select 1 from video v where v.id = c.video_id and v.auteur = $2::uuid))
      returning c.video_id`, [commentaireId, u.id, u.role === "admin"]);
  if (!r) throw new ErreurMetier("NON_AUTORISE");
  return listerCommentaires(r.video_id);
}
