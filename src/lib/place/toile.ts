import "server-only";
import type { PoolClient } from "pg";
import { query, queryOne, tx } from "../db";
import { ErreurMetier } from "../errors";
import type { Utilisateur } from "../session";
import { comptesLies } from "../traces";
import {
  PIXELS_MAX_PAR_RECHARGE, TAILLE, encoderToile, entierDans, normaliserZone, pixelValide,
  type Contributeur, type EtatToile, type HistoriqueToile, type InfoPixel,
} from "./commun";

/*
 * La Toile : toile de pixels partagée. Chaque compte dispose d'un lot de
 * `place_config.pixels_par_recharge` pixels (1 par défaut) ; le délai
 * `delai_secondes` (5 minutes par défaut) part du premier pixel du lot et,
 * une fois écoulé, le lot entier revient. L'état fait
 * foi en base ; le temps réel est une attente longue réveillée en mémoire
 * (un seul processus Next.js), comme Curve Fight.
 */

/** Verrou consultatif de toutes les écritures (voir le bloc du schéma). */
const VERROU = 7_140_001;
/** Au-delà de ce retard, on renvoie la toile entière plutôt que les changements. */
const RETARD_MAX = 3000;

const memoire = globalThis as unknown as { placeAttentes?: Set<() => void> };
const attentes = (memoire.placeAttentes ??= new Set());

export function reveiller(): void {
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
    v: number; delai: number; pixels: number; gelee: boolean; recharge: number | null; poses: number | null;
    banni: boolean | null; maintenant: number;
  }>(
    `select (select coalesce(max(id), 0) from place_log)::bigint as v,
            c.delai_secondes as delai, c.pixels_par_recharge as pixels, c.gelee,
            (extract(epoch from j.dernier_pose + make_interval(secs => c.delai_secondes)) * 1000)::bigint as recharge,
            j.poses_cycle as poses, j.banni,
            (extract(epoch from now()) * 1000)::bigint as maintenant
       from place_config c
       left join place_joueur j on j.user_id = $1::uuid`, [userId]);
  if (!r) throw new Error("place_config vide : migration de La Toile non appliquée");

  const enCycle = !!r.recharge && r.recharge > r.maintenant;
  const restants = enCycle ? Math.max(0, r.pixels - (r.poses ?? 0)) : r.pixels;
  const recharge = enCycle ? r.recharge! : 0;
  const etat: EtatToile = {
    v: r.v, maintenant: r.maintenant, delai: r.delai, pixels: r.pixels, gelee: r.gelee,
    prochain: restants > 0 ? 0 : recharge, restants, recharge,
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

type ResultatPose = { prochain: number; restants: number; recharge: number };

/**
 * Pose un pixel. Les administrateurs peuvent passer outre le délai et le
 * gel (`sansDelai`). `appareil` (cookie mp2_appareil) sert contre les
 * doublons : le lot est aussi compté par appareil, et un compte utilisé
 * sur le même appareil qu'un compte banni ou refusé est banni à son tour.
 */
export async function poserPixel(
  u: Utilisateur, x: unknown, y: unknown, couleur: unknown, sansDelai = false, appareil: string | null = null,
): Promise<ResultatPose> {
  if (!pixelValide(x, y, couleur)) throw new ErreurMetier("PLACE_INVALIDE");
  const admin = sansDelai && u.role === "admin";
  // Le bannissement d'un doublon doit être validé avant de lever l'erreur.
  const r = await ecrire<ResultatPose | "doublon">(async c => {
    const cfg = (await c.query<{ delai: number; pixels: number; gelee: boolean }>(
      `select delai_secondes as delai, pixels_par_recharge as pixels, gelee from place_config`)).rows[0];
    await c.query(`insert into place_joueur (user_id) values ($1::uuid) on conflict do nothing`, [u.id]);
    const j = (await c.query<{ banni: boolean; en_cycle: boolean; poses: number }>(
      `select banni, poses_cycle as poses,
              coalesce(dernier_pose > now() - make_interval(secs => $2), false) as en_cycle
         from place_joueur where user_id = $1::uuid`, [u.id, cfg.delai])).rows[0];
    if (j.banni) throw new ErreurMetier("PLACE_BANNI");
    if (!admin && cfg.gelee) throw new ErreurMetier("PLACE_GELEE");
    if (!admin && j.en_cycle && j.poses >= cfg.pixels) throw new ErreurMetier("PLACE_TROP_TOT");

    let app: { en_cycle: boolean; poses: number } | null = null;
    if (appareil && u.role !== "admin") {
      const d = await c.query(
        `select 1 from compte_trace t
           join app_user o on o.id = t.user_id
           left join place_joueur pj on pj.user_id = t.user_id
          where t.nature = 'appareil' and t.valeur = $1 and t.user_id <> $2::uuid
            and (coalesce(pj.banni, false) or o.statut <> 'actif')
          limit 1`, [appareil, u.id]);
      if (d.rowCount) {
        await c.query(`update place_joueur set banni = true where user_id = $1::uuid`, [u.id]);
        return "doublon";
      }
      await c.query(`insert into place_appareil (appareil) values ($1) on conflict do nothing`, [appareil]);
      app = (await c.query<{ en_cycle: boolean; poses: number }>(
        `select poses_cycle as poses,
                coalesce(dernier_pose > now() - make_interval(secs => $2), false) as en_cycle
           from place_appareil where appareil = $1`, [appareil, cfg.delai])).rows[0];
      if (!admin && app.en_cycle && app.poses >= cfg.pixels) throw new ErreurMetier("PLACE_TROP_TOT");
    }

    const log = await c.query<{ id: number }>(
      `insert into place_log (x, y, couleur, user_id, nature) values ($1, $2, $3, $4::uuid, $5) returning id`,
      [x, y, couleur, u.id, admin ? "admin" : "pixel"]);
    await c.query(
      `insert into place_pixel (x, y, couleur, log_id) values ($1, $2, $3, $4)
       on conflict (x, y) do update set couleur = excluded.couleur, log_id = excluded.log_id`,
      [x, y, couleur, log.rows[0].id]);
    // Un pixel admin ne consomme pas le lot de l'administrateur.
    if (admin) return { prochain: 0, restants: cfg.pixels, recharge: 0 };
    // Premier pixel d'un lot : le délai de recharge part maintenant.
    const p = await c.query<{ recharge: number; poses: number }>(
      `update place_joueur
          set dernier_pose = case when $2 then dernier_pose else now() end,
              poses_cycle  = case when $2 then poses_cycle + 1 else 1 end
        where user_id = $1::uuid
       returning (extract(epoch from dernier_pose + make_interval(secs => $3)) * 1000)::bigint as recharge,
                 poses_cycle as poses`,
      [u.id, j.en_cycle, cfg.delai]);
    let { recharge, poses } = p.rows[0];
    if (appareil && app) {
      const a = await c.query<{ recharge: number; poses: number }>(
        `update place_appareil
            set dernier_pose = case when $2 then dernier_pose else now() end,
                poses_cycle  = case when $2 then poses_cycle + 1 else 1 end
          where appareil = $1
         returning (extract(epoch from dernier_pose + make_interval(secs => $3)) * 1000)::bigint as recharge,
                   poses_cycle as poses`,
        [appareil, app.en_cycle, cfg.delai]);
      // L'appareil est plus avancé dans son lot (autre compte) : c'est lui qui borne.
      if (a.rows[0].poses > poses) ({ recharge, poses } = a.rows[0]);
    }
    const restants = Math.max(0, cfg.pixels - poses);
    return { prochain: restants > 0 ? 0 : recharge, restants, recharge };
  });
  if (r === "doublon") throw new ErreurMetier("PLACE_DOUBLON");
  return r;
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

/** Rétablit, là où il est visible, la couleur d'avant chaque pixel annulé. */
function retablirAnnules(c: PoolClient, adminId: string): Promise<number> {
  return appliquer(c, adminId,
    `select p.x, p.y, coalesce((
        select l2.couleur from place_log l2
         where l2.x = p.x and l2.y = p.y and not l2.annule
         order by l2.id desc limit 1), 0) as c
       from place_pixel p join place_log l on l.id = p.log_id
      where l.annule`, []);
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
    return retablirAnnules(c, u.id);
  });
}

/**
 * Contre les vagues de faux comptes : bannit tous les membres inscrits
 * depuis `heures` heures et annule tous leurs pixels. Renvoie le nombre
 * de pixels modifiés sur la toile.
 */
export async function bannirRecents(u: Utilisateur, heures: unknown): Promise<{ comptes: number; modifies: number }> {
  exigerAdmin(u);
  if (!entierDans(heures, 1, 24 * 30)) throw new ErreurMetier("PLACE_INVALIDE");
  return ecrire(async c => {
    const b = await c.query(
      `insert into place_joueur (user_id, banni)
       select id, true from app_user
        where role = 'member' and created_at > now() - make_interval(hours => $1::int)
       on conflict (user_id) do update set banni = true`, [heures]);
    await c.query(
      `update place_log l set annule = true
         from app_user a
        where a.id = l.user_id and a.role = 'member'
          and a.created_at > now() - make_interval(hours => $1::int)
          and l.nature = 'pixel' and not l.annule`, [heures]);
    return { comptes: b.rowCount ?? 0, modifies: await retablirAnnules(c, u.id) };
  });
}

/**
 * Bannit un membre et tous les comptes qui partagent son appareil ou une
 * IP récente (doublons probables). Renvoie le nombre de comptes bannis.
 */
export async function bannirAvecDoublons(u: Utilisateur, cibleId: unknown): Promise<number> {
  exigerAdmin(u);
  if (typeof cibleId !== "string" || !/^[0-9a-f-]{36}$/i.test(cibleId)) throw new ErreurMetier("PLACE_INVALIDE");
  const lies = (await comptesLies([cibleId])).get(cibleId) ?? [];
  const ids = [cibleId, ...lies.map(l => l.id)];
  const r = await query(
    `insert into place_joueur (user_id, banni)
     select a.id, true from app_user a where a.id = any($1::uuid[]) and a.role = 'member'
     on conflict (user_id) do update set banni = true
     returning 1`, [ids]);
  reveiller();
  return r.length;
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
  await query(
    `update place_joueur set dernier_pose = null, poses_cycle = 0 where $1::uuid is null or user_id = $1::uuid`,
    [cibleId]);
  reveiller();
}

export async function reglerToile(
  u: Utilisateur, reglages: { gelee?: unknown; delai?: unknown; pixels?: unknown },
): Promise<void> {
  exigerAdmin(u);
  const { gelee, delai, pixels } = reglages;
  if (gelee !== undefined && typeof gelee !== "boolean") throw new ErreurMetier("PLACE_INVALIDE");
  if (delai !== undefined && !entierDans(delai, 0, 86400)) throw new ErreurMetier("PLACE_INVALIDE");
  if (pixels !== undefined && !entierDans(pixels, 1, PIXELS_MAX_PAR_RECHARGE)) throw new ErreurMetier("PLACE_INVALIDE");
  await query(
    `update place_config set gelee = coalesce($1, gelee), delai_secondes = coalesce($2, delai_secondes),
            pixels_par_recharge = coalesce($3, pixels_par_recharge)`,
    [gelee ?? null, delai ?? null, pixels ?? null]);
  reveiller();
}

/** Membres ayant joué, les plus récents d'abord (tableau de modération). */
export async function contributeurs(u: Utilisateur): Promise<Contributeur[]> {
  exigerAdmin(u);
  const rows = await query<{
    id: string; nom: string; banni: boolean; dernier: Date | null; heure: number; total: number; cree: Date;
  }>(
    `select j.user_id as id, u.display_name as nom, j.banni, j.dernier_pose as dernier, u.created_at as cree,
            count(l.id) filter (where l.cree_le > now() - interval '1 hour')::int as heure,
            count(l.id)::int as total
       from place_joueur j
       join app_user u on u.id = j.user_id
       left join place_log l on l.user_id = j.user_id and l.nature = 'pixel' and not l.annule
      group by j.user_id, u.display_name, u.created_at, j.banni, j.dernier_pose
      order by j.banni, j.dernier_pose desc nulls last
      limit 300`);
  const lies = await comptesLies(rows.map(r => r.id));
  return rows.map(r => ({
    ...r, dernier: r.dernier ? r.dernier.toISOString() : null, cree: r.cree.toISOString(),
    lies: (lies.get(r.id) ?? []).map(({ nom, banni, par }) => ({ nom, banni, par })),
  }));
}

/**
 * Historique complet de la toile, pour le timelapse (administrateurs).
 * Rejouer les lignes dans l'ordre redonne l'état de la toile à tout
 * instant, modération comprise.
 */
export async function historiqueToile(u: Utilisateur): Promise<HistoriqueToile> {
  exigerAdmin(u);
  const rows = await query<{ x: number; y: number; couleur: number; annule: boolean; t: number }>(
    `select x, y, couleur, annule, floor(extract(epoch from cree_le))::int as t
       from place_log order by id`);
  const debut = rows[0]?.t ?? 0;
  const evenements: number[] = [];
  for (const r of rows) evenements.push(r.x, r.y, r.couleur, r.annule ? 1 : 0, r.t - debut);
  return { debut, evenements };
}
