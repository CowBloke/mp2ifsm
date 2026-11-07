import "server-only";
import { query } from "./db";
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
