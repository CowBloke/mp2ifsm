import "server-only";
import { query, tx } from "./db";
import { ErreurMetier } from "./errors";
import { comptesLies } from "./traces";

/*
 * Validation des inscriptions : tout nouveau compte est « en_attente »
 * jusqu'à ce qu'un administrateur l'accepte (« actif ») ou le refuse.
 * Les comptes liés (même appareil, même IP récente) aident à repérer les
 * doublons et les vagues de bots.
 */

export type Inscription = {
  id: string; display_name: string; email: string; created_at: string;
  statut: "en_attente" | "refuse"; ip: string | null;
  lies: { nom: string; statut: string; banni: boolean; par: ("ip" | "appareil")[] }[];
};

/** Comptes en attente, puis refusés des 14 derniers jours. */
export async function listerInscriptions(): Promise<Inscription[]> {
  const rows = await query<Omit<Inscription, "lies" | "created_at"> & { created_at: Date }>(
    `select id, display_name, email, created_at, statut::text as statut, inscription_ip as ip
       from app_user
      where statut = 'en_attente' or (statut = 'refuse' and created_at > now() - interval '14 days')
      order by statut, created_at desc
      limit 500`);
  const lies = await comptesLies(rows.map(r => r.id));
  return rows.map(r => ({
    ...r, created_at: r.created_at.toISOString(),
    lies: (lies.get(r.id) ?? []).map(({ nom, statut, banni, par }) => ({ nom, statut, banni, par })),
  }));
}

/** Accepte ou refuse des comptes ; un refus ferme leurs sessions. Renvoie le nombre traité. */
export async function deciderInscriptions(adminId: string, ids: string[], accepter: boolean): Promise<number> {
  if (!ids.length) return 0;
  if (ids.some(id => !/^[0-9a-f-]{36}$/i.test(id))) throw new ErreurMetier("NON_AUTORISE");
  return tx(async c => {
    const r = await c.query(
      `update app_user set statut = $2::statut_compte, valide_par = $3::uuid, valide_le = now()
        where id = any($1::uuid[]) and role = 'member' and id <> $3::uuid`,
      [ids, accepter ? "actif" : "refuse", adminId]);
    if (!accepter) await c.query(`delete from user_session where user_id = any($1::uuid[])`, [ids]);
    return r.rowCount ?? 0;
  });
}
