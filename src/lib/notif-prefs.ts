import "server-only";
import { queryOne } from "./db";

export type EtatNotif = {
  flash: boolean;
  /** Heure du rappel des fiches (Paris). */
  flash_heure: number;
  /** La fenêtre du flash du jour a reçu une réponse. */
  flash_repondu: boolean;
  devoirs: boolean;
  messages: boolean;
  /** Appareils abonnés, tous navigateurs confondus. */
  appareils: number;
};

export async function lireEtatNotif(userId: string): Promise<EtatNotif> {
  const r = await queryOne<EtatNotif>(
    `select coalesce(p.flash, false) as flash, coalesce(p.flash_heure, 18)::int as flash_heure,
            coalesce(p.flash_repondu, false) as flash_repondu,
            coalesce(p.devoirs, true) as devoirs, coalesce(p.messages, true) as messages,
            (select count(*)::int from push_abonnement a where a.user_id = $1::uuid) as appareils
       from (select $1::uuid as id) u
       left join notif_pref p on p.user_id = u.id`, [userId]);
  return r ?? { flash: false, flash_heure: 18, flash_repondu: false, devoirs: true, messages: true, appareils: 0 };
}
