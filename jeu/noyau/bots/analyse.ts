import type { CoupDef, Emplacement, PersoDef } from "../definitions";

/*
 * Ce qu'un bot sait des coups d'un personnage, déduit de ses données :
 * portée (hitboxes décalées de l'élan du coup), démarrage, dégâts. Aucun
 * coup n'est décrit à la main pour les bots : un nouveau personnage est
 * jouable par eux sans une ligne de plus.
 */

/** Zone touchée, relative aux pieds, personnage tourné vers +x, y vers le HAUT. */
export type Zone = { gauche: number; droite: number; bas: number; haut: number };

export type AnalyseCoup = {
  emplacement: Emplacement;
  id: string;
  /** Premier tick actif. */
  debut: number;
  duree: number;
  degats: number;
  zones: Zone[];
  /** Coup de contre (réponse à une attaque adverse). */
  contre: boolean;
  aerien: boolean;
};

const EMPLACEMENTS: readonly Emplacement[] = [
  "neutre", "cote", "haut", "bas", "air_neutre", "air_cote", "air_haut", "air_bas",
  "special_neutre", "special_cote", "special_haut", "special_bas", "ultime",
];

/** Déplacement vers l'avant accumulé par les mouvements imposés jusqu'à `frame`. */
function elanJusque(coup: CoupDef, frame: number): number {
  let d = 0;
  for (let f = 0; f < frame; f++) {
    for (const m of coup.mouvement ?? []) if (f >= m.de && f <= m.a && m.vx !== undefined) d += m.vx;
  }
  return d;
}

/** Dégâts d'un coup : un par groupe de hitboxes (le plus fort), plus sa suite sur touche. */
function degatsDe(perso: PersoDef, coup: CoupDef, vus = new Set<CoupDef>()): number {
  if (vus.has(coup)) return 0;
  vus.add(coup);
  const parGroupe = new Map<number, number>();
  for (const hb of coup.hitboxes ?? []) {
    const g = hb.groupe ?? 0;
    parGroupe.set(g, Math.max(parGroupe.get(g) ?? 0, hb.degats));
  }
  let total = [...parGroupe.values()].reduce((a, b) => a + b, 0);
  const suite = coup.surTouche ? perso.coups[coup.surTouche.coup] : undefined;
  if (suite) total += degatsDe(perso, suite, vus);
  return total;
}

const cache = new WeakMap<PersoDef, AnalyseCoup[]>();

export function analyser(perso: PersoDef): AnalyseCoup[] {
  const deja = cache.get(perso);
  if (deja) return deja;
  const analyses: AnalyseCoup[] = [];
  for (const e of EMPLACEMENTS) {
    const coup = perso.coups[e];
    if (!coup) continue;
    const hbs = coup.hitboxes ?? [];
    const debut = hbs.length > 0 ? Math.min(...hbs.map((h) => h.de)) : coup.duree;
    analyses.push({
      emplacement: e,
      id: e,
      debut,
      duree: coup.duree,
      degats: degatsDe(perso, coup),
      zones: hbs.map((hb) => {
        const d = elanJusque(coup, hb.de);
        return {
          gauche: hb.x - hb.l / 2 + d,
          droite: hb.x + hb.l / 2 + d,
          bas: hb.y - hb.h / 2,
          haut: hb.y + hb.h / 2,
        };
      }),
      contre: coup.contre !== undefined,
      aerien: e.startsWith("air_"),
    });
  }
  cache.set(perso, analyses);
  return analyses;
}

/** Distance horizontale typique à laquelle ce personnage frappe au sol. */
export function porteeTypique(perso: PersoDef): number {
  const au = analyser(perso).filter((a) => !a.aerien && a.zones.length > 0 && a.emplacement !== "ultime");
  if (au.length === 0) return 0;
  const portees = au.map((a) => Math.max(...a.zones.map((z) => z.droite))).sort((a, b) => a - b);
  return portees[Math.floor(portees.length / 2)];
}
