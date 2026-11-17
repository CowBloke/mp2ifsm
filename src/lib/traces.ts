import "server-only";
import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { query } from "./db";

/*
 * Traces anti-doublons : l'IP du client et un identifiant d'appareil
 * (cookie aléatoire posé au premier passage, 2 ans). Deux comptes sur le
 * même appareil sont presque sûrement la même personne ; une IP partagée
 * peut n'être que le wifi du lycée, on l'affiche sans rien en conclure.
 */

const COOKIE_APPAREIL = "mp2_appareil";

export type Trace = { ip: string | null; appareil: string | null };

/** IP réelle : Cloudflare la donne dans CF-Connecting-IP (nginx ne voit que cloudflared). */
export async function ipClient(): Promise<string | null> {
  const h = await headers();
  const brut = h.get("cf-connecting-ip") ?? h.get("x-real-ip") ?? "";
  const ip = brut.trim().slice(0, 64);
  return /^[0-9a-fA-F:.]{3,64}$/.test(ip) ? ip : null;
}

/**
 * Identifiant d'appareil du navigateur, créé s'il manque. Les cookies ne
 * s'écrivent que depuis une action ou une route : ailleurs on se contente
 * de le lire.
 */
export async function appareilClient(): Promise<string | null> {
  const jar = await cookies();
  const existant = jar.get(COOKIE_APPAREIL)?.value;
  if (existant && /^[A-Za-z0-9_-]{16,64}$/.test(existant)) return existant;
  const nouveau = randomBytes(18).toString("base64url");
  try {
    jar.set(COOKIE_APPAREIL, nouveau, {
      httpOnly: true, sameSite: "lax", path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 2 * 365 * 86_400,
    });
    return nouveau;
  } catch {
    return null;
  }
}

export async function traceRequete(): Promise<Trace> {
  return { ip: await ipClient(), appareil: await appareilClient() };
}

/** Enregistre la trace pour ce compte (sans jamais faire échouer la requête). */
export async function noterTrace(userId: string, t: Trace): Promise<void> {
  const lignes: [string, string][] = [];
  if (t.ip) lignes.push(["ip", t.ip]);
  if (t.appareil) lignes.push(["appareil", t.appareil]);
  if (!lignes.length) return;
  try {
    await query(
      `insert into compte_trace (user_id, nature, valeur)
       select $1::uuid, n, v from unnest($2::text[], $3::text[]) as t(n, v)
       on conflict (user_id, nature, valeur) do update set dernier = now()`,
      [userId, lignes.map(l => l[0]), lignes.map(l => l[1])]);
  } catch (err) {
    console.error("traces :", err);
  }
}

export type CompteLie = { id: string; nom: string; statut: string; banni: boolean; par: ("ip" | "appareil")[] };

/**
 * Autres comptes qui partagent un appareil ou une IP avec chacun des
 * comptes donnés (IP vues dans les 30 derniers jours seulement).
 */
export async function comptesLies(ids: string[]): Promise<Map<string, CompteLie[]>> {
  const res = new Map<string, CompteLie[]>();
  if (!ids.length) return res;
  const rows = await query<{ source: string; id: string; nom: string; statut: string; banni: boolean; par: ("ip" | "appareil")[] }>(
    `select a.user_id as source, u.id, u.display_name as nom, u.statut::text as statut,
            coalesce(j.banni, false) as banni,
            array_agg(distinct a.nature order by a.nature) as par
       from compte_trace a
       join compte_trace b on b.nature = a.nature and b.valeur = a.valeur and b.user_id <> a.user_id
       join app_user u on u.id = b.user_id
       left join place_joueur j on j.user_id = u.id
      where a.user_id = any($1::uuid[])
        and (a.nature = 'appareil' or (a.dernier > now() - interval '30 days' and b.dernier > now() - interval '30 days'))
      group by a.user_id, u.id, u.display_name, u.statut, j.banni
      order by u.display_name`, [ids]);
  for (const r of rows) {
    const { source, ...lie } = r;
    if (!res.has(source)) res.set(source, []);
    res.get(source)!.push(lie);
  }
  return res;
}
