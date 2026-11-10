"use server";

import { z } from "zod";
import { query } from "./db";
import { ErreurMetier, messageFr } from "./errors";
import { clesVapid, envoyerAuMembre } from "./notifications";
import { ecrirePrefsNotif, type PrefsNotif } from "./notif-prefs";
import { exigerUtilisateur } from "./session";
import type { Reponse } from "./actions";

function echec(err: unknown): { ok: false; erreur: string } {
  if (!(err instanceof ErreurMetier)) console.error(err);
  return { ok: false, erreur: messageFr(err) };
}

/** Clé publique VAPID, nécessaire au navigateur pour s'abonner. */
export async function clePubliquePush(): Promise<Reponse<{ cle: string }>> {
  try {
    await exigerUtilisateur();
    return { ok: true, data: { cle: (await clesVapid()).publique } };
  } catch (err) {
    return echec(err);
  }
}

const SchemaAbonnement = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://")),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }),
});

/** Enregistre (ou rattache au membre courant) l'abonnement de cet appareil. */
export async function enregistrerAbonnement(
  abonnement: unknown, appareil: string,
): Promise<Reponse<undefined>> {
  try {
    const u = await exigerUtilisateur();
    const a = SchemaAbonnement.parse(abonnement);
    await query(
      `insert into push_abonnement (user_id, endpoint, p256dh, auth, appareil)
       values ($1::uuid, $2, $3, $4, $5)
       on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh,
              auth = excluded.auth, appareil = excluded.appareil, echecs = 0`,
      [u.id, a.endpoint, a.keys.p256dh, a.keys.auth, String(appareil ?? "").slice(0, 80) || null],
    );
    await query(`insert into notif_pref (user_id) values ($1::uuid) on conflict do nothing`, [u.id]);
    return { ok: true };
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, erreur: "Abonnement invalide" };
    return echec(err);
  }
}

export async function supprimerAbonnement(endpoint: string): Promise<Reponse<undefined>> {
  try {
    const u = await exigerUtilisateur();
    await query(`delete from push_abonnement where endpoint = $1 and user_id = $2::uuid`,
      [String(endpoint ?? ""), u.id]);
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}

export type { PrefsNotif };

/** Change une ou plusieurs préférences. Répondre au flash ferme sa fenêtre. */
export async function definirPrefsNotif(
  prefs: Partial<PrefsNotif> & { flashRepondu?: boolean },
): Promise<Reponse<PrefsNotif>> {
  try {
    return { ok: true, data: await ecrirePrefsNotif(await exigerUtilisateur(), prefs) };
  } catch (err) {
    return echec(err);
  }
}

/** Notification d'essai sur tous les appareils du membre. */
export async function envoyerNotifTest(): Promise<Reponse<{ appareils: number }>> {
  try {
    const u = await exigerUtilisateur();
    const n = await envoyerAuMembre(u.id, {
      titre: "Notifications activées", corps: "Les notifications mp2ifsm arrivent bien sur cet appareil.",
      url: "/profil", tag: "test",
    });
    return { ok: true, data: { appareils: n } };
  } catch (err) {
    return echec(err);
  }
}
