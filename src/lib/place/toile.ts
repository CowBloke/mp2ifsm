import "server-only";
import type { PoolClient } from "pg";
import { query, queryOne, tx } from "../db";
import { ErreurMetier } from "../errors";
import type { Utilisateur } from "../session";
import {
  TAILLE, encoderToile, entierDans, normaliserZone, pixelValide,
  type Contributeur, type EtatToile, type InfoPixel,
} from "./commun";

/*
 * La Toile : toile de pixels partagée. Chaque compte pose un pixel, puis
 * attend `place_config.delai_secondes` (5 minutes par défaut). L'état fait
 * foi en base ; le temps réel est une attente longue réveillée en mémoire
 * (un seul processus Next.js), comme Curve Fight.
 */

/** Verrou consultatif de toutes les écritures (voir le bloc du schéma). */
const VERROU = 7_140_001;
/** Au-delà de ce retard, on renvoie la toile entière plutôt que les changements. */
const RETARD_MAX = 3000;

const memoire = globalThis as unknown as { placeAttentes?: Set<() => void> };
const attentes = (memoire.placeAttentes ??= new Set());

function reveiller(): void {
  for (const f of [...attentes]) f();
}

/** Attend le prochain changement (pixel, gel, bannissement…), `delai` ms au plus. */
export function attendreChangement(delai: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise(resoudre => {
    const fin = () => {
      clearTimeout(minuterie);
      attentes.delete(fin);
      signal.removeEventListener("abort", fin);
      resoudre();
    };
    const minuterie = setTimeout(fin, delai);
    attentes.add(fin);
    signal.addEventListener("abort", fin);
  });
}

async function ecrire<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const r = await tx(async c => {
    await c.query(`select pg_advisory_xact_lock($1)`, [VERROU]);
    return fn(c);
  });
  reveiller();
  return r;
}

export async function versionToile(): Promise<number> {
  const r = await queryOne<{ v: number }>(`select coalesce(max(id), 0)::bigint as v from place_log`);
  return r?.v ?? 0;
}

/**
 * État vu par un membre : toute la toile si `connue` < 0 ou trop ancienne,
 * sinon les seuls pixels changés depuis.
 */
export async function lireToile(userId: string, connue: number): Promise<EtatToile> {
  const r = await queryOne<{
    v: number; delai: number; gelee: boolean; prochain: number | null; banni: boolean | null; maintenant: number;
  }>(
    `select (select coalesce(max(id), 0) from place_log)::bigint as v,
            c.delai_secondes as delai, c.gelee,
            (extract(epoch from j.dernier_pose + make_interval(secs => c.delai_secondes)) * 1000)::bigint as prochain,
            j.banni,
            (extract(epoch from now()) * 1000)::bigint as maintenant
       from place_config c
       left join place_joueur j on j.user_id = $1::uuid`, [userId]);
  if (!r) throw new Error("place_config vide : migration de La Toile non appliquée");

  const etat: EtatToile = {
    v: r.v, maintenant: r.maintenant, delai: r.delai, gelee: r.gelee,
    prochain: r.prochain && r.prochain > r.maintenant ? r.prochain : 0,
    banni: r.banni ?? false,
  };

  if (connue >= 0 && connue <= r.v && r.v - connue <= RETARD_MAX) {
    if (connue < r.v) {
      // Lignes d'id ≤ v seulement : une écriture arrivée entre les deux
      // lectures sera servie au prochain appel, pas sautée.
      const rows = await query<{ x: number; y: number; couleur: number }>(
        `select distinct on (x, y) x, y, couleur from place_log
          where id > $1 and id <= $2 order by x, y, id desc`, [connue, r.v]);
      etat.changements = rows.flatMap(p => [p.x, p.y, p.couleur]);
    } else {
      etat.changements = [];
    }
    return etat;
  }

  // Toile entière, à la version v exactement (état courant filtré).
  const octets = new Uint8Array(TAILLE * TAILLE);
  const rows = await query<{ x: number; y: number; couleur: number }>(
    `select distinct on (x, y) x, y, couleur from place_log
      where id <= $1 order by x, y, id desc`, [r.v]);
  for (const p of rows) octets[p.y * TAILLE + p.x] = p.couleur;
  etat.plein = encoderToile(octets);
  return etat;
}

/** Pose un pixel. Les administrateurs peuvent passer outre le délai et le gel (`sansDelai`). */
export async function poserPixel(
  u: Utilisateur, x: unknown, y: unknown, couleur: unknown, sansDelai = false,
): Promise<{ prochain: number }> {
  if (!pixelValide(x, y, couleur)) throw new ErreurMetier("PLACE_INVALIDE");
  const admin = sansDelai && u.role === "admin";
  return ecrire(async c => {
    const cfg = (await c.query<{ delai: number; gelee: boolean }>(
      `select delai_secondes as delai, gelee from place_config`)).rows[0];
    await c.query(`insert into place_joueur (user_id) values ($1::uuid) on conflict do nothing`, [u.id]);
    const j = (await c.query<{ banni: boolean; attente: boolean }>(
      `select banni,
              coalesce(dernier_pose > now() - make_interval(secs => $2), false) as attente
         from place_joueur where user_id = $1::uuid`, [u.id, cfg.delai])).rows[0];
    if (j.banni) throw new ErreurMetier("PLACE_BANNI");
    if (!admin && cfg.gelee) throw new ErreurMetier("PLACE_GELEE");
    if (!admin && j.attente) throw new ErreurMetier("PLACE_TROP_TOT");

    const log = await c.query<{ id: number }>(
      `insert into place_log (x, y, couleur, user_id, nature) values ($1, $2, $3, $4::uuid, $5) returning id`,
      [x, y, couleur, u.id, admin ? "admin" : "pixel"]);
    await c.query(
      `insert into place_pixel (x, y, couleur, log_id) values ($1, $2, $3, $4)
       on conflict (x, y) do update set couleur = excluded.couleur, log_id = excluded.log_id`,
      [x, y, couleur, log.rows[0].id]);
    // Un pixel admin ne consomme pas le délai de l'administrateur.
    if (admin) return { prochain: 0 };
    const p = await c.query<{ prochain: number }>(
      `update place_joueur set dernier_pose = now() where user_id = $1::uuid
       returning (extract(epoch from now() + make_interval(secs => $2)) * 1000)::bigint as prochain`,
      [u.id, cfg.delai]);
    return { prochain: p.rows[0].prochain };
  });
}

/** Qui a posé ce pixel, et quand. Visible de tous, comme sur r/place. */
export async function infoPixel(x: number, y: number): Promise<InfoPixel> {
  if (!pixelValide(x, y, 0)) throw new ErreurMetier("PLACE_INVALIDE");
  const r = await queryOne<{
    couleur: number; user_id: string | null; nom: string | null; nature: "pixel" | "admin"; le: Date;
  }>(
    `select p.couleur, l.user_id, u.display_name as nom, l.nature, l.cree_le as le
       from place_pixel p join place_log l on l.id = p.log_id
       left join app_user u on u.id = l.user_id
      where p.x = $1 and p.y = $2`, [x, y]);
  if (!r) return { x, y, couleur: 0, auteur: null, nature: null, le: null };
  return {
    x, y, couleur: r.couleur, nature: r.nature, le: r.le.toISOString(),
    auteur: { id: r.user_id, nom: r.nom },
  };
}

/* --- Modération -------------------------------------------------------- */

function exigerAdmin(u: Utilisateur): void {
  if (u.role !== "admin") throw new ErreurMetier("NON_AUTORISE");
}

/*
 * Applique une couleur cible à un ensemble de pixels (CTE `cible(x, y, c)`
 * fournie par l'appelant) : une ligne de journal « admin » par pixel qui
 * change vraiment. Renvoie le nombre de pixels modifiés.
 */
async function appliquer(c: PoolClient, adminId: string, cible: string, params: unknown[]): Promise<number> {
  const n = params.length + 1;
  const r = await c.query<{ n: number }>(
    `with cible as (${cible}),
          diff as (
            select t.x::smallint as x, t.y::smallint as y, t.c::smallint as c
              from cible t left join place_pixel p on p.x = t.x and p.y = t.y
             where coalesce(p.couleur, 0) <> t.c),
          ins as (
            insert into place_log (x, y, couleur, user_id, nature)
            select x, y, c, $${n}::uuid, 'admin' from diff order by y, x
            returning id, x, y, couleur),
          maj as (
            insert into place_pixel (x, y, couleur, log_id)
            select x, y, couleur, id from ins
            on conflict (x, y) do update set couleur = excluded.couleur, log_id = excluded.log_id
            returning 1)
     select count(*)::int as n from maj`, [...params, adminId]);
  return r.rows[0].n;
}

const ZONE = `select x, y from generate_series($1::int, $3::int) x, generate_series($2::int, $4::int) y`;

/** Remplit un rectangle d'une couleur (le blanc efface). */
export async function remplirZone(u: Utilisateur, zone: unknown, couleur: unknown): Promise<number> {
  exigerAdmin(u);
  const z = normaliserZone(zone as never);
  if (!z || !pixelValide(0, 0, couleur)) throw new ErreurMetier("PLACE_INVALIDE");
  return ecrire(c => appliquer(c, u.id,
    `select z.x, z.y, $5::int as c from (${ZONE}) z`, [z.x0, z.y0, z.x1, z.y1, couleur]));
}

/** Remet un rectangle dans l'état où il était il y a `minutes` minutes (pixels annulés ignorés). */
export async function restaurerZone(u: Utilisateur, zone: unknown, minutes: unknown): Promise<number> {
  exigerAdmin(u);
  const z = normaliserZone(zone as never);
  if (!z || !entierDans(minutes, 1, 60 * 24 * 365)) throw new ErreurMetier("PLACE_INVALIDE");
  return ecrire(c => appliquer(c, u.id,
    `select z.x, z.y, coalesce((
        select l.couleur from place_log l
         where l.x = z.x and l.y = z.y and not l.annule
           and l.cree_le <= now() - make_interval(mins => $5::int)
         order by l.id desc limit 1), 0) as c
       from (${ZONE}) z`, [z.x0, z.y0, z.x1, z.y1, minutes]));
}

/**
 * Annule les pixels d'un membre (les `minutes` dernières, ou tous si null).
 * Là où il est encore visible, le pixel reprend la couleur d'avant lui ;
 * ce que d'autres ont dessiné par-dessus est conservé.
 */
export async function annulerMembre(u: Utilisateur, cibleId: unknown, minutes: unknown): Promise<number> {
  exigerAdmin(u);
  if (typeof cibleId !== "string" || !/^[0-9a-f-]{36}$/i.test(cibleId)) throw new ErreurMetier("PLACE_INVALIDE");
  if (minutes !== null && !entierDans(minutes, 1, 60 * 24 * 365)) throw new ErreurMetier("PLACE_INVALIDE");
  return ecrire(async c => {
    await c.query(
      `update place_log set annule = true
        where user_id = $1::uuid and nature = 'pixel' and not annule
          and ($2::int is null or cree_le >= now() - make_interval(mins => $2::int))`, [cibleId, minutes]);
    return appliquer(c, u.id,
      `select p.x, p.y, coalesce((
          select l2.couleur from place_log l2
           where l2.x = p.x and l2.y = p.y and not l2.annule
           order by l2.id desc limit 1), 0) as c
         from place_pixel p join place_log l on l.id = p.log_id
        where l.annule`, []);
  });
}

export async function bannir(u: Utilisateur, cibleId: unknown, banni: boolean): Promise<void> {
  exigerAdmin(u);
  if (typeof cibleId !== "string" || !/^[0-9a-f-]{36}$/i.test(cibleId)) throw new ErreurMetier("PLACE_INVALIDE");
  await query(
    `insert into place_joueur (user_id, banni) values ($1::uuid, $2)
     on conflict (user_id) do update set banni = excluded.banni`, [cibleId, banni]);
  reveiller();
}

/** Remet à zéro l'attente d'un membre (ou de tous si cibleId est null). */
export async function leverDelai(u: Utilisateur, cibleId: unknown): Promise<void> {
  exigerAdmin(u);
  if (cibleId !== null && (typeof cibleId !== "string" || !/^[0-9a-f-]{36}$/i.test(cibleId))) {
    throw new ErreurMetier("PLACE_INVALIDE");
  }
  await query(`update place_joueur set dernier_pose = null where $1::uuid is null or user_id = $1::uuid`, [cibleId]);
  reveiller();
}

export async function reglerToile(u: Utilisateur, reglages: { gelee?: unknown; delai?: unknown }): Promise<void> {
  exigerAdmin(u);
  const { gelee, delai } = reglages;
  if (gelee !== undefined && typeof gelee !== "boolean") throw new ErreurMetier("PLACE_INVALIDE");
  if (delai !== undefined && !entierDans(delai, 0, 86400)) throw new ErreurMetier("PLACE_INVALIDE");
  await query(
    `update place_config set gelee = coalesce($1, gelee), delai_secondes = coalesce($2, delai_secondes)`,
    [gelee ?? null, delai ?? null]);
  reveiller();
}

/** Membres ayant joué, les plus récents d'abord (tableau de modération). */
export async function contributeurs(u: Utilisateur): Promise<Contributeur[]> {
  exigerAdmin(u);
  const rows = await query<{
    id: string; nom: string; banni: boolean; dernier: Date | null; heure: number; total: number;
  }>(
    `select j.user_id as id, u.display_name as nom, j.banni, j.dernier_pose as dernier,
            count(l.id) filter (where l.cree_le > now() - interval '1 hour')::int as heure,
            count(l.id)::int as total
       from place_joueur j
       join app_user u on u.id = j.user_id
       left join place_log l on l.user_id = j.user_id and l.nature = 'pixel' and not l.annule
      group by j.user_id, u.display_name, j.banni, j.dernier_pose
      order by j.banni desc, j.dernier_pose desc nulls last
      limit 200`);
  return rows.map(r => ({ ...r, dernier: r.dernier ? r.dernier.toISOString() : null }));
}
