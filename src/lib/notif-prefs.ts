import "server-only";
import { query, queryOne } from "./db";
import { ErreurMetier } from "./errors";
import { FLASH_HEURE_MAX, FLASH_HEURE_MIN } from "./notifications";
import type { Utilisateur } from "./session";

export type EtatNotif = {
  flash: boolean;
  /** Heure du rappel des fiches (Paris). */
  flash_heure: number;
  /** La fenêtre du flash du jour a reçu une réponse. */
  flash_repondu: boolean;
  devoirs: boolean;
  messages: boolean;
  /** Appareils abonnés : navigateurs et iPhone (app). */
  appareils: number;
};

export async function lireEtatNotif(userId: string): Promise<EtatNotif> {
  const r = await queryOne<EtatNotif>(
    `select coalesce(p.flash, false) as flash, coalesce(p.flash_heure, 18)::int as flash_heure,
            coalesce(p.flash_repondu, false) as flash_repondu,
            coalesce(p.devoirs, true) as devoirs, coalesce(p.messages, true) as messages,
            ((select count(*) from push_abonnement a where a.user_id = $1::uuid)
             + (select count(*) from apns_appareil i where i.user_id = $1::uuid))::int as appareils
       from (select $1::uuid as id) u
       left join notif_pref p on p.user_id = u.id`, [userId]);
  return r ?? { flash: false, flash_heure: 18, flash_repondu: false, devoirs: true, messages: true, appareils: 0 };
}

export type PrefsNotif = { flash: boolean; flash_heure: number; devoirs: boolean; messages: boolean };

/** Change une ou plusieurs préférences (les autres restent). Répondre au flash ferme sa fenêtre. */
export async function ecrirePrefsNotif(
  u: Utilisateur, prefs: Partial<PrefsNotif> & { flashRepondu?: boolean },
): Promise<PrefsNotif> {
  const b = (v: unknown) => (typeof v === "boolean" ? v : null);
  const h = prefs.flash_heure;
  const heure = Number.isInteger(h) && h! >= FLASH_HEURE_MIN && h! <= FLASH_HEURE_MAX ? h! : null;
  const r = await queryOne<PrefsNotif>(
    `insert into notif_pref as p (user_id, flash, flash_repondu, devoirs, messages, flash_heure)
     values ($1::uuid, coalesce($2, false), coalesce($3, false), coalesce($4, true), coalesce($5, true),
             coalesce($6::smallint, 18))
     on conflict (user_id) do update set
       flash         = coalesce($2, p.flash),
       flash_repondu = coalesce($3, p.flash_repondu) or $2 is not null,
       devoirs       = coalesce($4, p.devoirs),
       messages      = coalesce($5, p.messages),
       flash_heure   = coalesce($6::smallint, p.flash_heure),
       updated_at    = now()
     returning flash, flash_heure::int as flash_heure, devoirs, messages`,
    [u.id, b(prefs.flash), b(prefs.flashRepondu) ?? (b(prefs.flash) === null ? null : true),
     b(prefs.devoirs), b(prefs.messages), heure],
  );
  return r!;
}

/**
 * iPhone de l'app : son jeton APNs, rattaché au membre connecté (un
 * téléphone passé à quelqu'un d'autre change simplement de propriétaire).
 */
export async function enregistrerAppareilIos(u: Utilisateur, jeton: unknown, environnement: unknown): Promise<void> {
  const j = String(jeton ?? "").toLowerCase();
  if (!/^[0-9a-f]{64,200}$/.test(j) || (environnement !== "sandbox" && environnement !== "production")) {
    throw new ErreurMetier("APPAREIL_INVALIDE");
  }
  await query(
    `insert into apns_appareil (user_id, jeton, environnement) values ($1::uuid, $2, $3)
     on conflict (jeton) do update set user_id = excluded.user_id, environnement = excluded.environnement, echecs = 0`,
    [u.id, j, environnement]);
  await query(`insert into notif_pref (user_id) values ($1::uuid) on conflict do nothing`, [u.id]);
}

export async function retirerAppareilIos(u: Utilisateur, jeton: unknown): Promise<void> {
  await query(`delete from apns_appareil where jeton = $1 and user_id = $2::uuid`,
    [String(jeton ?? "").toLowerCase(), u.id]);
}
