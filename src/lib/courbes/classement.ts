import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pool, query, tx } from "@/lib/db";
import { formeCanonique } from "./expression";
import type { Reglages } from "./monde";

/*
 * Curve Fight : statistiques gardées en base (db/schema-courbes.sql).
 *
 * La migration est appliquée ici au premier besoin : le jeu arrive ainsi
 * par le déploiement automatique, sans étape manuelle. Si la base refuse
 * (droits, panne), on le journalise et le jeu continue sans classement.
 */

let schema: Promise<boolean> | null = null;

function schemaPret(): Promise<boolean> {
  schema ??= (async () => {
    try {
      await pool.query(await readFile(join(process.cwd(), "db/schema-courbes.sql"), "utf8"));
      return true;
    } catch (err) {
      console.error("curve fight : classement indisponible :", err);
      schema = null;      // nouvel essai au prochain appel
      return false;
    }
  })();
  return schema;
}

const estUuid = (id: string) => /^[0-9a-f-]{36}$/.test(id);

export type TirVictorieux = { userId: string; expression: string; victimes: number; longueur: number };

export async function enregistrerTirs(tirs: TirVictorieux[], reglages: Reglages): Promise<void> {
  const valides = tirs.filter((t) => estUuid(t.userId) && t.victimes > 0);
  if (!valides.length || !(await schemaPret())) return;
  try {
    for (const t of valides) {
      await query(
        `insert into courbes_tir (user_id, expression, canonique, mode, tir, victimes, longueur)
         values ($1::uuid, $2, $3, $4, $5, $6, $7)`,
        [t.userId, t.expression, formeCanonique(t.expression), reglages.mode, reglages.tir, t.victimes, t.longueur]);
    }
  } catch (err) {
    console.error("curve fight : tir non enregistré :", err);
  }
}

export type ResultatJoueur = {
  userId: string; rang: number; points: number; eliminations: number; manchesGagnees: number;
};

export async function enregistrerPartie(resultats: ResultatJoueur[], reglages: Reglages): Promise<void> {
  const humains = resultats.filter((r) => estUuid(r.userId));
  if (humains.length < 2 || !(await schemaPret())) return;
  try {
    await tx(async (c) => {
      const p = await c.query<{ id: number }>(
        `insert into courbes_partie (mode, tir, joueurs, manches) values ($1, $2, $3, $4) returning id`,
        [reglages.mode, reglages.tir, humains.length, reglages.manches]);
      for (const r of humains) {
        await c.query(
          `insert into courbes_resultat (partie_id, user_id, rang, points, eliminations, manches_gagnees)
           values ($1, $2::uuid, $3, $4, $5, $6)`,
          [p.rows[0].id, r.userId, r.rang, r.points, r.eliminations, r.manchesGagnees]);
      }
    });
  } catch (err) {
    console.error("curve fight : partie non enregistrée :", err);
  }
}

/* --- Lecture ----------------------------------------------------------- */

export type LigneJoueur = {
  id: string; nom: string; parties: number; victoires: number; eliminations: number; manches: number;
};
export type LigneTir = {
  id: number; nom: string; expression: string; tir: Reglages["tir"]; mode: Reglages["mode"];
  victimes: number; longueur: number; cree_le: Date;
};
export type LigneFetiche = {
  expression: string; tir: Reglages["tir"]; victimes: number; tirs: number; auteurs: number;
};

export type Classements = {
  joueurs: LigneJoueur[]; tirs: LigneTir[]; lointains: LigneTir[]; fetiches: LigneFetiche[];
};

const VIDE: Classements = { joueurs: [], tirs: [], lointains: [], fetiches: [] };
const COLONNES_TIR = `t.id, u.display_name as nom, t.expression, t.tir, t.mode, t.victimes, t.longueur, t.cree_le`;

export async function lireClassements(): Promise<Classements> {
  if (!(await schemaPret())) return VIDE;
  try {
    const [joueurs, tirs, lointains, fetiches] = await Promise.all([
      query<LigneJoueur>(
        `select u.id, u.display_name as nom, count(*)::int as parties,
                -- Finir en tête sans avoir marqué n'est pas une victoire.
                count(*) filter (where r.rang = 1 and r.points > 0)::int as victoires,
                sum(r.eliminations)::int as eliminations, sum(r.manches_gagnees)::int as manches
           from courbes_resultat r join app_user u on u.id = r.user_id
          group by u.id, u.display_name
          order by victoires desc, eliminations desc, parties asc, nom
          limit 30`),
      query<LigneTir>(
        `select ${COLONNES_TIR} from courbes_tir t join app_user u on u.id = t.user_id
          order by t.victimes desc, t.longueur desc, t.cree_le limit 15`),
      query<LigneTir>(
        `select ${COLONNES_TIR} from courbes_tir t join app_user u on u.id = t.user_id
          order by t.longueur desc, t.cree_le limit 8`),
      query<LigneFetiche>(
        `select min(t.expression) as expression, t.tir, sum(t.victimes)::int as victimes,
                count(*)::int as tirs, count(distinct t.user_id)::int as auteurs
           from courbes_tir t
          group by t.canonique, t.tir
          order by victimes desc, tirs desc, expression
          limit 12`),
    ]);
    return { joueurs, tirs, lointains, fetiches };
  } catch (err) {
    console.error("curve fight : lecture du classement :", err);
    return VIDE;
  }
}
