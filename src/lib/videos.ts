import "server-only";
import { query } from "./db";
import type { CouleurMatiere } from "./constantes";

export type VideoVue = {
  id: number;
  titre: string;
  description: string;
  auteur_id: string;
  auteur: string;
  matiere: string | null;
  couleur: CouleurMatiere | null;
  duree_ms: number;
  likes: number;
  aime: boolean;
  vues: number;
  commentaires: number;
  created_at: string;
};

export type VideoEnCours = { id: number; titre: string; statut: "traitement" | "echec"; created_at: string };

export type CommentaireVideo = {
  id: number; auteur_id: string; auteur: string; texte: string; created_at: string;
};

/** Vidéos prêtes, les plus récentes d'abord (la classe en publie peu). */
export async function listerVideos(userId: string, matiere?: number | null): Promise<VideoVue[]> {
  return query<VideoVue>(
    `select v.id, v.titre, v.description, v.auteur as auteur_id, u.display_name as auteur,
            s.nom as matiere, s.couleur, coalesce(v.duree_ms, 0) as duree_ms,
            (select count(*)::int from video_like l where l.video_id = v.id) as likes,
            exists (select 1 from video_like l where l.video_id = v.id and l.user_id = $1::uuid) as aime,
            (select count(*)::int from video_vue w where w.video_id = v.id) as vues,
            (select count(*)::int from video_commentaire c where c.video_id = v.id) as commentaires,
            v.created_at::text
       from video v
       join app_user u on u.id = v.auteur
       left join subject s on s.id = v.subject_id
      where v.statut = 'pret' and ($2::smallint is null or v.subject_id = $2)
      order by v.created_at desc
      limit 300`, [userId, matiere ?? null]);
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
