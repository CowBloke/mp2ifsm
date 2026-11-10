/*
 * Curve Fight : l'arène, ses constantes et les réglages d'un salon.
 * Module pur, partagé par le serveur et le navigateur.
 */
import { TOUTES_FAMILLES, type Famille } from "./expression";

/** Repère : x de −25 à 25, y de −15 à 15. */
export const X_MAX = 25;
export const Y_MAX = 15;
export const RAYON_JOUEUR = 0.8;
export const RAYON_CRATERE = 1.3;
/** Longueur d'arc parcourue par tick ; toutes les courbes avancent du même pas. */
export const PAS = 0.12;
/** Unités d'arène par seconde à l'écran. */
export const VITESSE = 9;
export const LONGUEUR_MAX = 140;
/** Brouillard : disque dégagé autour de soi, couloir dégagé par ses courbes. */
export const VUE_DEPART = 4.5;
export const VUE_TRACE = 2.4;

export const JOUEURS_MAX = 10;
export const VOLEES_MAX = 8;

export type Cercle = { x: number; y: number; r: number };

export type Reglages = {
  mode: "classique" | "brouillard";
  tir: "fonction" | "equadiff";
  repereMuet: boolean;
  /** Aide facultative : tracé de sa propre courbe pendant la saisie. Coupée par défaut, le jeu se joue de tête. */
  apercu: boolean;
  familles: Famille[];
  /** Caractères au plus, 0 : libre. */
  longueurMax: number;
  /** Secondes de préparation, 0 : sans limite. */
  temps: number;
  manches: number;
  obstacles: "peu" | "normal" | "beaucoup";
};

export const REGLAGES_DEFAUT: Reglages = {
  mode: "classique", tir: "fonction", repereMuet: false, apercu: false,
  familles: [...TOUTES_FAMILLES], longueurMax: 0, temps: 90, manches: 3, obstacles: "normal",
};

export const CHOIX = {
  longueurMax: [0, 40, 25, 15],
  temps: [45, 90, 150, 0],
  manches: [1, 3, 5],
  obstacles: ["peu", "normal", "beaucoup"] as const,
};

/** Applique un changement venu du navigateur ; tout ce qui est hors liste est ignoré. */
export function corrigerReglages(actuels: Reglages, brut: Record<string, unknown>): Reglages {
  const r = { ...actuels };
  if (brut.mode === "classique" || brut.mode === "brouillard") r.mode = brut.mode;
  if (brut.tir === "fonction" || brut.tir === "equadiff") r.tir = brut.tir;
  if (typeof brut.repereMuet === "boolean") r.repereMuet = brut.repereMuet;
  if (typeof brut.apercu === "boolean") r.apercu = brut.apercu;
  if (Array.isArray(brut.familles)) r.familles = TOUTES_FAMILLES.filter((f) => (brut.familles as unknown[]).includes(f));
  if (CHOIX.longueurMax.includes(brut.longueurMax as number)) r.longueurMax = brut.longueurMax as number;
  if (CHOIX.temps.includes(brut.temps as number)) r.temps = brut.temps as number;
  if (CHOIX.manches.includes(brut.manches as number)) r.manches = brut.manches as number;
  if (CHOIX.obstacles.includes(brut.obstacles as never)) r.obstacles = brut.obstacles as Reglages["obstacles"];
  return r;
}

/** Générateur déterministe (mulberry32) : une graine, une arène. */
export function aleatoire(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Arene = { positions: { x: number; y: number }[]; obstacles: Cercle[] };

const NB_OBSTACLES = { peu: 6, normal: 11, beaucoup: 17 };

/**
 * Place n joueurs sur des coordonnées entières, loin les uns des autres,
 * puis sème des obstacles ronds qui ne touchent personne. Les obstacles
 * peuvent se chevaucher : ils forment alors des massifs.
 */
export function genererArene(graine: number, n: number, densite: Reglages["obstacles"]): Arene {
  const rnd = aleatoire(graine);
  const positions: { x: number; y: number }[] = [];
  let ecart = Math.min(22, 60 / Math.sqrt(n));
  while (positions.length < n) {
    let place = false;
    for (let essai = 0; essai < 200 && !place; essai++) {
      const x = Math.round((rnd() * 2 - 1) * (X_MAX - 3));
      const y = Math.round((rnd() * 2 - 1) * (Y_MAX - 3));
      if (positions.every((p) => Math.hypot(p.x - x, p.y - y) >= ecart)) {
        positions.push({ x, y });
        place = true;
      }
    }
    if (!place) ecart *= 0.85;
  }

  const obstacles: Cercle[] = [];
  const voulu = NB_OBSTACLES[densite];
  for (let essai = 0; essai < 600 && obstacles.length < voulu; essai++) {
    const r = 1.2 + rnd() * rnd() * 3.4;
    const x = (rnd() * 2 - 1) * (X_MAX - 1);
    const y = (rnd() * 2 - 1) * (Y_MAX - 1);
    if (positions.some((p) => Math.hypot(p.x - x, p.y - y) < r + RAYON_JOUEUR + 1.4)) continue;
    obstacles.push({ x: arrondir(x), y: arrondir(y), r: arrondir(r) });
  }
  return { positions, obstacles };
}

export const arrondir = (v: number) => Math.round(v * 100) / 100;
/** Points des courbes : au millième, pour rester sur le graphe quand on zoome. */
export const arrondirFin = (v: number) => Math.round(v * 1000) / 1000;

export function dansCercles(cercles: Cercle[], x: number, y: number): boolean {
  for (const c of cercles) {
    const dx = x - c.x, dy = y - c.y;
    if (dx * dx + dy * dy <= c.r * c.r) return true;
  }
  return false;
}

/** Matière pleine : dans un obstacle, hors de tout cratère. */
export function solide(obstacles: Cercle[], crateres: Cercle[], x: number, y: number): boolean {
  return dansCercles(obstacles, x, y) && !dansCercles(crateres, x, y);
}

/* --- Brouillard : grille de visibilité, tenue par le serveur ---------- */

const CASE = 0.25;
const COLONNES = Math.round((2 * X_MAX) / CASE);
const LIGNES = Math.round((2 * Y_MAX) / CASE);

export function nouveauVoile(): Uint8Array {
  return new Uint8Array(COLONNES * LIGNES);
}

export function devoiler(voile: Uint8Array, x: number, y: number, r: number): void {
  const c0 = Math.max(0, Math.floor((x - r + X_MAX) / CASE));
  const c1 = Math.min(COLONNES - 1, Math.floor((x + r + X_MAX) / CASE));
  const l0 = Math.max(0, Math.floor((y - r + Y_MAX) / CASE));
  const l1 = Math.min(LIGNES - 1, Math.floor((y + r + Y_MAX) / CASE));
  for (let l = l0; l <= l1; l++) {
    const cy = (l + 0.5) * CASE - Y_MAX;
    for (let c = c0; c <= c1; c++) {
      const cx = (c + 0.5) * CASE - X_MAX;
      if ((cx - x) ** 2 + (cy - y) ** 2 <= r * r) voile[l * COLONNES + c] = 1;
    }
  }
}

export function visible(voile: Uint8Array, x: number, y: number): boolean {
  const c = Math.floor((x + X_MAX) / CASE), l = Math.floor((y + Y_MAX) / CASE);
  if (c < 0 || c >= COLONNES || l < 0 || l >= LIGNES) return false;
  return voile[l * COLONNES + c] === 1;
}

/** Un cercle se voit dès que son centre ou un point de son bord est dégagé. */
export function cercleVisible(voile: Uint8Array, c: Cercle): boolean {
  if (visible(voile, c.x, c.y)) return true;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * 2 * Math.PI;
    if (visible(voile, c.x + c.r * Math.cos(a), c.y + c.r * Math.sin(a))) return true;
  }
  return false;
}
