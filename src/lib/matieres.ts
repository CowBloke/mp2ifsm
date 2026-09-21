import "server-only";
import type { PoolClient } from "pg";
import { query } from "./db";
import { ErreurMetier } from "./errors";
import type { MatiereVue } from "./constantes";

/*
 * Matières gérées par les administrateurs.
 *
 * Une matière archivée reste lisible partout (les paquets, documents et
 * échéances qui la portent gardent leur nom et leur couleur) mais
 * n'est plus proposée pour du contenu neuf. « Sans matière » est
 * subject_id null.
 */

export async function listerMatieres(inclureArchivees = false): Promise<MatiereVue[]> {
  return query<MatiereVue>(
    `select id, nom, couleur, archived_at is not null as archivee
       from subject
      where $1::boolean or archived_at is null
      order by archived_at is not null, position, nom`,
    [inclureArchivees],
  );
}

/**
 * Lit la matière d'un formulaire : "" = sans matière, sinon l'id d'une
 * matière active. Lève MATIERE_INVALIDE pour tout le reste.
 */
export async function matiereDuFormulaire(
  valeur: unknown,
  c?: PoolClient,
): Promise<number | null> {
  const brut = String(valeur ?? "").trim();
  if (brut === "") return null;
  const id = Number(brut);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ErreurMetier("MATIERE_INVALIDE");
  const sql = `select 1 from subject where id = $1 and archived_at is null`;
  const trouve = c ? (await c.query(sql, [id])).rowCount : (await query(sql, [id])).length;
  if (!trouve) throw new ErreurMetier("MATIERE_INVALIDE");
  return id;
}
