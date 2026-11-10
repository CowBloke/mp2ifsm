import "server-only";
import { timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { query, queryOne } from "./db";
import { ErreurMetier } from "./errors";
import type { Utilisateur } from "./session";
import { RACINE, supprimerDuDisque } from "./stockage";
import type { Periode } from "./toilet-statuts";

/*
 * Toilet! — rubrique cachée : classement des passages aux toilettes du
 * bas, avec photo de preuve de propreté facultative.
 *
 * Tout est réservé aux membres inscrits par le lien secret : les pages,
 * le classement et les photos répondent 404 aux autres, pour que la
 * rubrique n'existe tout simplement pas pour eux.
 */

export const DOSSIER_PHOTOS_TOILET = join(RACINE, "toilet-photos");
/** Délai minimal entre deux passages d'un même membre. */
export const DELAI_MINUTES = 3;
/** Une photo de téléphone est réduite côté client ; marge confortable. */
export const TAILLE_MAX_PHOTO = 8 * 1024 * 1024;

export async function estMembreToilet(userId: string): Promise<boolean> {
  const r = await queryOne<{ ok: boolean }>(
    `select exists (select 1 from toilet_membre where user_id = $1::uuid) as ok`, [userId]);
  return r?.ok ?? false;
}

/** Lecture tolérante : si la migration n'est pas passée, la rubrique reste cachée. */
export async function toiletVisible(userId: string): Promise<boolean> {
  try { return await estMembreToilet(userId); } catch { return false; }
}

export async function codeInvitation(): Promise<string | null> {
  const r = await queryOne<{ code: string }>(`select code_invitation as code from toilet_config`);
  return r?.code ?? null;
}

function memeCode(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Inscrit le membre si le code du lien secret est le bon. */
export async function activerToiletPour(u: Utilisateur, code: unknown): Promise<void> {
  const attendu = await codeInvitation();
  if (!attendu || typeof code !== "string" || !memeCode(code, attendu)) {
    throw new ErreurMetier("TOILET_LIEN_INVALIDE");
  }
  await query(`insert into toilet_membre (user_id) values ($1::uuid) on conflict do nothing`, [u.id]);
}

/** Retire un passage (et sa photo) : son auteur (fausse manip) ou un administrateur. */
export async function supprimerPassagePour(u: Utilisateur, passageId: number): Promise<void> {
  if (!(await estMembreToilet(u.id))) throw new ErreurMetier("NON_AUTORISE");
  if (!Number.isSafeInteger(passageId) || passageId <= 0) throw new ErreurMetier("NON_AUTORISE");
  const r = await queryOne<{ storage_name: string | null }>(
    `delete from toilet_passage where id = $1 and (user_id = $2::uuid or $3)
      returning storage_name`, [passageId, u.id, u.role === "admin"]);
  if (!r) throw new ErreurMetier("NON_AUTORISE");
  if (r.storage_name) await supprimerDuDisque(DOSSIER_PHOTOS_TOILET, r.storage_name).catch(console.error);
}

export type LigneClassement = {
  user_id: string;
  display_name: string;
  /** Passages sur la période choisie. */
  n: number;
  /** Dont avec photo. */
  photos: number;
  /** Total depuis toujours : il fixe le statut. */
  total: number;
  dernier: string | null;
};

/* Début de période à l'heure de Paris : la semaine commence le lundi. */
const DEBUT: Record<Periode, string> = {
  semaine: `date_trunc('week', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'`,
  mois: `date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'`,
  total: `'-infinity'::timestamptz`,
};

/**
 * Tous les membres inscrits, même à zéro passage : la honte fait partie
 * du jeu. Égalité départagée par le plus ancien dernier passage (celui
 * qui y est arrivé le premier garde la place).
 */
export async function classementToilet(periode: Periode): Promise<LigneClassement[]> {
  return query<LigneClassement>(
    `select m.user_id, u.display_name,
            count(p.id) filter (where p.cree_le >= ${DEBUT[periode]})::int as n,
            count(p.id) filter (where p.cree_le >= ${DEBUT[periode]} and p.storage_name is not null)::int as photos,
            count(p.id)::int as total,
            max(p.cree_le) filter (where p.cree_le >= ${DEBUT[periode]}) as dernier
       from toilet_membre m
       join app_user u on u.id = m.user_id
       left join toilet_passage p on p.user_id = m.user_id
      group by m.user_id, u.display_name
      order by n desc, dernier asc nulls last, lower(u.display_name)`);
}

export type PassageVue = {
  id: number;
  user_id: string;
  display_name: string;
  cree_le: string;
  photo: boolean;
};

export async function derniersPassages(limite = 12): Promise<PassageVue[]> {
  return query<PassageVue>(
    `select p.id, p.user_id, u.display_name, p.cree_le, p.storage_name is not null as photo
       from toilet_passage p join app_user u on u.id = p.user_id
      order by p.cree_le desc limit $1`, [limite]);
}

/** Mes passages sans photo des 14 derniers jours : la preuve peut suivre. */
export async function aProuver(userId: string): Promise<{ id: number; cree_le: string }[]> {
  return query(
    `select id, cree_le from toilet_passage
      where user_id = $1::uuid and storage_name is null and cree_le > now() - interval '14 days'
      order by cree_le desc limit 10`, [userId]);
}

export type MesStats = { total: number; aujourdhui: number; dernier: string | null };

export async function mesStats(userId: string): Promise<MesStats> {
  const r = await queryOne<MesStats>(
    `select count(*)::int as total,
            count(*) filter (where cree_le >= date_trunc('day', now() at time zone 'Europe/Paris')
                                              at time zone 'Europe/Paris')::int as aujourdhui,
            max(cree_le) as dernier
       from toilet_passage where user_id = $1::uuid`, [userId]);
  return r ?? { total: 0, aujourdhui: 0, dernier: null };
}

/** « à l’instant », « il y a 12 min », « il y a 3 h », « hier 14:05 », « 12/11 08:30 ». */
export function ilYa(iso: string | Date, maintenant = new Date()): string {
  const d = new Date(iso);
  const min = Math.floor((maintenant.getTime() - d.getTime()) / 60_000);
  if (min < 1) return "à l’instant";
  if (min < 60) return `il y a ${min} min`;
  if (min < 6 * 60) return `il y a ${Math.floor(min / 60)} h`;
  const heure = d.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
  const jour = (x: Date) => x.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
  if (jour(d) === jour(maintenant)) return `aujourd’hui ${heure}`;
  if (jour(d) === jour(new Date(maintenant.getTime() - 86_400_000))) return `hier ${heure}`;
  return `${d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" })} ${heure}`;
}
