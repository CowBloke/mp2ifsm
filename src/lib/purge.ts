import "server-only";
import { query, tx } from "./db";
import { DOSSIER_DOCUMENTS, supprimerDuDisque } from "./stockage";

// Internal maintenance only: never exported as a callable server action.
export async function purgerDocuments(): Promise<{ purges: number; erreurs: number }> {
  const candidats = await query<{ id: number }>(
    `select id from document where deleted_at is not null and purge_after <= now() limit 500`);
  let purges = 0, erreurs = 0;
  for (const { id } of candidats) {
    try {
      const efface = await tx(async c => {
        const r = await c.query<{ storage_name: string }>(
          `select storage_name from document where id = $1
             and deleted_at is not null and purge_after <= now() for update`, [id]);
        if (!r.rows[0]) return false;
        await supprimerDuDisque(DOSSIER_DOCUMENTS, r.rows[0].storage_name);
        await c.query("delete from document where id = $1", [id]);
        return true;
      });
      if (efface) purges++;
    } catch (err) { console.error(`purge document ${id}:`, err); erreurs++; }
  }
  return { purges, erreurs };
}
