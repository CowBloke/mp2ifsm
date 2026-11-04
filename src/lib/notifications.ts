import webpush from "web-push";
import { query, queryOne } from "./db";

/*
 * Notifications poussées (Web Push, VAPID).
 *
 * Pas d'import "server-only" ici : le planificateur est chargé par
 * src/instrumentation.ts, hors de la couche React Server.
 *
 *   - clés VAPID créées au premier besoin et gardées en base (push_cle) ;
 *   - un abonnement par appareil (push_abonnement), supprimé dès que le
 *     service de push répond 404/410 ;
 *   - notif_envoi garantit un seul envoi par membre, genre et clé :
 *     un redémarrage ou deux processus ne doublent jamais une notif.
 */

export type ContenuNotif = {
  titre: string;
  corps: string;
  /** Page ouverte au toucher. */
  url: string;
  /** Même tag = la nouvelle remplace l'ancienne sur l'appareil. */
  tag: string;
};

export type GenreNotif = "flash" | "devoirs" | "message";

let clesMemo: { publique: string; privee: string } | null = null;

export async function clesVapid(): Promise<{ publique: string; privee: string }> {
  if (clesMemo) return clesMemo;
  let ligne = await queryOne<{ publique: string; privee: string }>(
    `select publique, privee from push_cle where id = 1`);
  if (!ligne) {
    const k = webpush.generateVAPIDKeys();
    // Deux processus au premier démarrage : le premier gagne, l'autre relit.
    await query(`insert into push_cle (id, publique, privee) values (1, $1, $2)
                 on conflict (id) do nothing`, [k.publicKey, k.privateKey]);
    ligne = await queryOne(`select publique, privee from push_cle where id = 1`);
  }
  clesMemo = ligne!;
  return clesMemo;
}

type Abonnement = { id: number; user_id: string; endpoint: string; p256dh: string; auth: string };

async function pousser(a: Abonnement, contenu: ContenuNotif): Promise<boolean> {
  const cles = await clesVapid();
  try {
    await webpush.sendNotification(
      { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
      JSON.stringify(contenu),
      {
        vapidDetails: { subject: "https://mp2ifsm.com", publicKey: cles.publique, privateKey: cles.privee },
        // Une notif périmée n'a pas d'intérêt (le flash surtout).
        TTL: 6 * 3600,
        urgency: "high",
        timeout: 10_000,
      },
    );
    await query(`update push_abonnement set last_ok_at = now(), echecs = 0 where id = $1`, [a.id]);
    return true;
  } catch (err) {
    const code = (err as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) {
      // Appareil désabonné ou app désinstallée.
      await query(`delete from push_abonnement where id = $1`, [a.id]);
    } else {
      console.error("push:", code ?? err);
      await query(`update push_abonnement set echecs = echecs + 1 where id = $1`, [a.id]);
      await query(`delete from push_abonnement where id = $1 and echecs >= 20`, [a.id]);
    }
    return false;
  }
}

/** Envoie à tous les appareils d'un membre. Renvoie le nombre de réussites. */
export async function envoyerAuMembre(userId: string, contenu: ContenuNotif): Promise<number> {
  const abos = await query<Abonnement>(
    `select id, user_id, endpoint, p256dh, auth from push_abonnement where user_id = $1::uuid`, [userId]);
  const r = await Promise.all(abos.map((a) => pousser(a, contenu)));
  return r.filter(Boolean).length;
}

/**
 * Envoi unique : réserve (membre, genre, clé) dans notif_envoi puis
 * pousse. Si la ligne existait déjà, rien ne part.
 */
export async function envoyerUneFois(
  userId: string, genre: GenreNotif, cle: string, contenu: ContenuNotif,
): Promise<boolean> {
  const reserve = await query(
    `insert into notif_envoi (user_id, genre, cle) values ($1::uuid, $2, $3)
     on conflict do nothing returning 1`, [userId, genre, cle]);
  if (reserve.length === 0) return false;
  return (await envoyerAuMembre(userId, contenu)) > 0;
}

/** Membres abonnés (au moins un appareil) ayant activé ce genre. */
async function destinataires(genre: GenreNotif, sauf?: string): Promise<string[]> {
  const colonne = genre === "flash" ? "coalesce(p.flash, false)"
    : genre === "devoirs" ? "coalesce(p.devoirs, true)" : "coalesce(p.messages, true)";
  const lignes = await query<{ id: string }>(
    `select distinct a.user_id as id
       from push_abonnement a
       left join notif_pref p on p.user_id = a.user_id
      where ${colonne} and ($1::uuid is null or a.user_id <> $1::uuid)`, [sauf ?? null]);
  return lignes.map((l) => l.id);
}

/* ------------------------------------------------------------------ */
/* Message de la classe                                                */
/* ------------------------------------------------------------------ */

export async function notifierMessage(texte: string, auteurId: string, cle: string): Promise<void> {
  const corps = texte.length > 180 ? `${texte.slice(0, 177)}…` : texte;
  const ids = await destinataires("message", auteurId);
  await Promise.all(ids.map((id) => envoyerUneFois(id, "message", cle, {
    titre: "Message de la classe", corps, url: "/", tag: "message",
  })));
}

/* ------------------------------------------------------------------ */
/* Heure de Paris                                                      */
/* ------------------------------------------------------------------ */

export function partiesParis(d: Date) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const v = (t: string) => Number(f.find((p) => p.type === t)!.value);
  return { y: v("year"), m: v("month"), d: v("day"), h: v("hour"), min: v("minute") };
}

export function jourDeParis(d: Date): string {
  const p = partiesParis(d);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Rappel quotidien des fiches                                         */
/* ------------------------------------------------------------------ */

/** Cartes proposées par le rappel. */
export const FLASH_CARTES = 3;
/** Heure du rappel par défaut et bornes du choix (heure de Paris). */
export const FLASH_HEURE_DEFAUT = 18;
export const FLASH_HEURE_MIN = 7;
export const FLASH_HEURE_MAX = 22;

/** Cartes disponibles (dues ou neuves) dans les paquets suivis. */
export async function cartesFlashDisponibles(userId: string): Promise<number> {
  const r = await queryOne<{ n: number }>(
    `select count(*)::int as n from (
       select 1 from card k
       join deck_subscription ab on ab.deck_id = k.deck_id and ab.user_id = $1::uuid
       join deck d on d.id = k.deck_id and d.archived_at is null
       left join card_state s on s.card_id = k.id and s.user_id = $1::uuid
      where k.deleted_at is null and (s.user_id is null or s.due <= now())
      limit $2) x`, [userId, FLASH_CARTES]);
  return r?.n ?? 0;
}

/** Envoie le rappel aux membres dont l'heure choisie est `heure`. */
async function envoyerRappelFiches(jour: string, heure: number): Promise<void> {
  const ids = await query<{ id: string }>(
    `select distinct a.user_id as id
       from push_abonnement a join notif_pref p on p.user_id = a.user_id
      where p.flash and p.flash_heure = $1`, [heure]);
  for (const { id } of ids) {
    const n = await cartesFlashDisponibles(id);
    if (n === 0) continue;
    await envoyerUneFois(id, "flash", jour, {
      titre: "Fiches du jour",
      corps: `${n} carte${n > 1 ? "s" : ""} à réviser, environ deux minutes.`,
      url: "/flash", tag: "flash",
    });
  }
}

/* ------------------------------------------------------------------ */
/* Devoirs : rappel la veille au soir                                  */
/* ------------------------------------------------------------------ */

export const DEVOIRS_HEURE = 19;

async function envoyerDevoirs(jour: string): Promise<void> {
  const demain = await query<{ titre: string; matiere: string | null }>(
    `select e.titre, sj.nom as matiere
       from echeance e left join subject sj on sj.id = e.subject_id
      where e.deleted_at is null
        and (e.due_at at time zone 'Europe/Paris')::date = $1::date + 1
      order by e.due_at`, [jour]);
  if (demain.length === 0) return;
  const liste = demain.map((e) => (e.matiere ? `${e.titre} (${e.matiere})` : e.titre)).join(", ");
  const corps = `Demain : ${liste}`;
  const ids = await destinataires("devoirs");
  await Promise.all(ids.map((id) => envoyerUneFois(id, "devoirs", jour, {
    titre: demain.length > 1 ? `${demain.length} échéances demain` : "Échéance demain",
    corps: corps.length > 180 ? `${corps.slice(0, 177)}…` : corps,
    url: "/", tag: "devoirs",
  })));
}

/* ------------------------------------------------------------------ */
/* Planificateur                                                       */
/* ------------------------------------------------------------------ */

/** Un passage : idempotent, appelé chaque minute. */
export async function tic(maintenant = new Date()): Promise<void> {
  const jour = jourDeParis(maintenant);
  const p = partiesParis(maintenant);
  // Pendant l'heure choisie seulement : un serveur arrêté ne rattrape pas.
  await envoyerRappelFiches(jour, p.h);
  if (p.h >= DEVOIRS_HEURE && p.h < 22) await envoyerDevoirs(jour);
}

const g = globalThis as unknown as { mp2Planificateur?: NodeJS.Timeout };

export function demarrerPlanificateur(): void {
  if (g.mp2Planificateur || process.env.MP2_NOTIFS === "off") return;
  const passer = () => { tic().catch((err) => console.error("planificateur notifications:", err)); };
  g.mp2Planificateur = setInterval(passer, 60_000);
  g.mp2Planificateur.unref();
  setTimeout(passer, 5_000).unref();
}
