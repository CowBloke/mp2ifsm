import "server-only";
import { queryOne } from "./db";

/** Message d'accueil affiché à toute la classe ; chaîne vide = aucun. */
export async function lireMessageAccueil(): Promise<{ texte: string; updated_at: string | null; auteur: string | null }> {
  const r = await queryOne<{ texte: string; updated_at: string; auteur: string | null }>(
    `select m.texte, m.updated_at, u.display_name as auteur
       from message_accueil m left join app_user u on u.id = m.updated_by
      where m.id = 1`,
  );
  return r ?? { texte: "", updated_at: null, auteur: null };
}
