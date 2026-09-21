import "server-only";
import { query } from "./db";
import type { CategorieRetour, StatutRetour } from "./constantes";

export type Retour = {
  id: number;
  categorie: CategorieRetour;
  message: string;
  page: string | null;
  statut: StatutRetour;
  reponse: string;
  auteur: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

const CHAMPS = `f.id, f.categorie, f.message, f.page, f.statut, f.reponse,
  u.display_name as auteur, f.created_at, f.updated_at, f.archived_at`;

/** Tous les retours, pour l'administration (filtrés côté interface). */
export async function tousLesRetours(): Promise<Retour[]> {
  return query<Retour>(
    `select ${CHAMPS} from feedback f join app_user u on u.id = f.user_id
      order by f.archived_at is not null, (f.statut = 'ouvert') desc, f.created_at desc
      limit 1000`,
  );
}

/** Retours d'un membre : il voit leur statut et la réponse. */
export async function mesRetours(userId: string): Promise<Retour[]> {
  return query<Retour>(
    `select ${CHAMPS} from feedback f join app_user u on u.id = f.user_id
      where f.user_id = $1::uuid
      order by f.created_at desc limit 100`,
    [userId],
  );
}
