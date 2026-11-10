/*
 * Curve Fight : une volée. Toutes les courbes partent en même temps de
 * leur auteur, dans les deux sens, et avancent du même pas de longueur
 * d'arc à chaque tick. Une courbe s'arrête au bord, sur un obstacle
 * (qu'elle creuse), sur une discontinuité, hors de son domaine, ou à la
 * mort de son auteur : la courbe la plus courte gagne les duels.
 *
 * Module pur et déterministe : le serveur calcule, le navigateur rejoue.
 */
import { compiler, type Expression } from "./expression";
import {
  LONGUEUR_MAX, PAS, RAYON_CRATERE, RAYON_JOUEUR, X_MAX, Y_MAX, arrondir, arrondirFin, solide, type Cercle,
} from "./monde";

export type Tireur = { id: string; x: number; y: number; expr: Expression | null };

export type Fin = "bord" | "obstacle" | "rupture" | "domaine" | "mort" | "longueur";

export type Trace = {
  joueur: string;
  dir: 1 | -1;
  /** x0, y0, x1, y1… : un point par tick, le premier au départ. */
  pts: number[];
  fin: Fin;
};

export type Evenement =
  | { tick: number; type: "elimination"; tueur: string; victime: string; x: number; y: number; longueur: number }
  | { tick: number; type: "impact"; joueur: string; x: number; y: number };

export type Resultat = { traces: Trace[]; evenements: Evenement[]; ticks: number; crateres: Cercle[] };

const H_MAX = 0.02;
const H_MIN = 1e-5;
/** Longueur visée d'un micro-segment : bien plus fin qu'un joueur. */
const SEGMENT = 0.05;
/** Au-delà, deux points voisins ne sont plus reliés : la courbe casse. */
const SAUT = 1.5;
const PAS_EQUADIFF = 0.02;
/** Pente au-delà de laquelle la solution de y′ = f(x, y) n'est plus un graphe : tangente verticale. */
const PENTE_MAX = 250;

type Branche = {
  joueur: string; dir: 1 | -1;
  x: number; y: number; decalage: number; h: number;
  reste: number; longueur: number;
  actif: boolean; fin: Fin; pts: number[];
  f: (x: number, y: number) => number;
};

export function simuler(
  tireurs: Tireur[], obstacles: Cercle[], crateresAvant: Cercle[], tir: "fonction" | "equadiff",
): Resultat {
  const crateres = [...crateresAvant];
  const nouveaux: Cercle[] = [];
  const evenements: Evenement[] = [];
  const vivants = new Map(tireurs.map((t) => [t.id, t]));
  const branches: Branche[] = [];

  for (const t of tireurs) {
    if (!t.expr) continue;
    const f = compiler(t.expr.arbre);
    const depart = tir === "fonction" ? f(t.x, 0) : f(t.x, t.y);
    for (const dir of [1, -1] as const) {
      branches.push({
        joueur: t.id, dir, x: t.x, y: t.y, decalage: t.y - depart, h: H_MAX,
        reste: 0, longueur: 0, actif: Number.isFinite(depart), fin: "domaine", pts: [t.x, t.y], f,
      });
    }
  }

  /** Morts de ce tick : appliquées quand toutes les courbes ont avancé. */
  let touches = new Map<string, Evenement & { type: "elimination" }>();
  let tick = 0;

  /** Teste un point de la courbe ; renvoie faux si la branche s'arrête là. */
  function controler(b: Branche, x: number, y: number): boolean {
    if (Math.abs(x) > X_MAX || Math.abs(y) > Y_MAX) { b.fin = "bord"; return false; }
    if (solide(obstacles, crateres, x, y)) {
      const c = { x: arrondir(x), y: arrondir(y), r: RAYON_CRATERE };
      crateres.push(c);
      nouveaux.push(c);
      evenements.push({ tick, type: "impact", joueur: b.joueur, x: c.x, y: c.y });
      b.fin = "obstacle";
      return false;
    }
    for (const cible of vivants.values()) {
      if (cible.id === b.joueur || touches.has(cible.id)) continue;
      const dx = x - cible.x, dy = y - cible.y;
      if (dx * dx + dy * dy <= RAYON_JOUEUR * RAYON_JOUEUR) {
        touches.set(cible.id, {
          tick, type: "elimination", tueur: b.joueur, victime: cible.id,
          x: cible.x, y: cible.y, longueur: arrondir(b.longueur),
        });
      }
    }
    return true;
  }

  /** Va jusqu'à (xn, yn) en contrôlant le trajet ; faux si la branche s'arrête. */
  function rejoindre(b: Branche, xn: number, yn: number, longueur: number): boolean {
    const n = Math.max(1, Math.ceil(longueur / SEGMENT));
    for (let k = 1; k <= n; k++) {
      const x = b.x + ((xn - b.x) * k) / n, y = b.y + ((yn - b.y) * k) / n;
      if (!controler(b, x, y)) {
        b.x = x; b.y = y; b.longueur += (longueur * k) / n;
        return false;
      }
    }
    b.x = xn; b.y = yn; b.longueur += longueur; b.reste -= longueur;
    if (b.longueur >= LONGUEUR_MAX) { b.fin = "longueur"; return false; }
    return true;
  }

  function avancerFonction(b: Branche): boolean {
    let h = b.h, xn = 0, yn = 0, longueur = 0;
    for (;;) {
      xn = b.x + b.dir * h;
      yn = b.f(xn, 0) + b.decalage;
      if (!Number.isFinite(yn)) {
        if (h > H_MIN) { h /= 2; continue; }
        b.fin = "domaine";
        return false;
      }
      longueur = Math.hypot(h, yn - b.y);
      if (longueur > SEGMENT && h > H_MIN) { h /= 2; continue; }
      if (longueur > SAUT) { b.fin = "rupture"; return false; }
      break;
    }
    b.h = longueur < SEGMENT / 3 ? Math.min(h * 2, H_MAX) : h;
    return rejoindre(b, xn, yn, longueur);
  }

  /** y′ = f(x, y), intégrée par Runge-Kutta 4 en longueur d'arc. */
  function avancerEquadiff(b: Branche): boolean {
    const pente = (x: number, y: number): [number, number] | null => {
      const g = b.f(x, y);
      if (!(Math.abs(g) <= PENTE_MAX)) return null;
      const n = Math.hypot(1, g);
      return [b.dir / n, (b.dir * g) / n];
    };
    const s = PAS_EQUADIFF;
    const k1 = pente(b.x, b.y);
    const k2 = k1 && pente(b.x + (s / 2) * k1[0], b.y + (s / 2) * k1[1]);
    const k3 = k2 && pente(b.x + (s / 2) * k2[0], b.y + (s / 2) * k2[1]);
    const k4 = k3 && pente(b.x + s * k3[0], b.y + s * k3[1]);
    if (!k1 || !k2 || !k3 || !k4) { b.fin = "domaine"; return false; }
    const xn = b.x + (s / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    const yn = b.y + (s / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    return rejoindre(b, xn, yn, s);
  }

  const avancer = tir === "fonction" ? avancerFonction : avancerEquadiff;
  const ticksMax = Math.ceil(LONGUEUR_MAX / PAS) + 20;

  while (tick < ticksMax && branches.some((b) => b.actif)) {
    tick++;
    for (const b of branches) {
      if (!b.actif) continue;
      b.reste += PAS;
      let garde = 0;
      while (b.reste > 0 && b.actif) {
        if (!avancer(b) || ++garde > 20000) b.actif = false;
      }
      if (garde > 20000) b.fin = "longueur";
      b.pts.push(arrondirFin(b.x), arrondirFin(b.y));
    }
    for (const e of touches.values()) {
      evenements.push(e);
      vivants.delete(e.victime);
      for (const b of branches) {
        if (b.joueur === e.victime && b.actif) { b.actif = false; b.fin = "mort"; }
      }
    }
    if (touches.size) touches = new Map();
  }

  evenements.sort((a, b) => a.tick - b.tick);
  return {
    traces: branches.map((b) => ({ joueur: b.joueur, dir: b.dir, pts: b.pts, fin: b.fin })),
    evenements, ticks: tick, crateres: nouveaux,
  };
}
