import type { Boite } from "../noyau/collisions";

/*
 * Caméra qui suit un point, en pixels du monde. Pur calcul, sans Pixi :
 * testable sans navigateur.
 */

export type Camera = { x: number; y: number };

/** Constante de temps du lissage : plus courte, la caméra est plus nerveuse. */
const LISSAGE_MS = 90;

/**
 * Rapproche le centre de la caméra de la cible, puis le borne pour que la
 * vue (vueLargeur × vueHauteur) ne sorte jamais de l'arène. `dtMs` infini
 * place la caméra directement sur la cible.
 */
export function suivreCible(
  cam: Camera, cibleX: number, cibleY: number, dtMs: number,
  vueLargeur: number, vueHauteur: number, limites: Boite,
): void {
  const k = 1 - Math.exp(-Math.max(0, dtMs) / LISSAGE_MS);
  cam.x = borner(cam.x + (cibleX - cam.x) * k, limites.gauche, limites.droite, vueLargeur);
  cam.y = borner(cam.y + (cibleY - cam.y) * k, limites.haut, limites.bas, vueHauteur);
}

/** Centre tel que [centre ± vue/2] reste dans [min, max] ; centré si l'arène est plus petite que la vue. */
function borner(centre: number, min: number, max: number, vue: number): number {
  if (max - min <= vue) return (min + max) / 2;
  return Math.min(Math.max(centre, min + vue / 2), max - vue / 2);
}

export type Cadrage = { x: number; y: number; hauteurVue: number };

/**
 * Cadrage d'un groupe (spectateur) : le plus petit plan, de rapport
 * largeur/hauteur `ratio`, qui montre tous les points avec leurs marges,
 * jamais plus serré que `hauteurMin` ni plus large que l'arène entière.
 * Sans point, toute l'arène.
 */
export function cadrerGroupe(
  points: readonly { x: number; y: number }[], ratio: number, limites: Boite,
  { margeX, margeY, hauteurMin }: { margeX: number; margeY: number; hauteurMin: number },
): Cadrage {
  const largeurArene = limites.droite - limites.gauche;
  const hauteurArene = limites.bas - limites.haut;
  const hauteurMax = Math.max(hauteurArene, largeurArene / ratio);
  if (points.length === 0) {
    return { x: (limites.gauche + limites.droite) / 2, y: (limites.haut + limites.bas) / 2, hauteurVue: hauteurMax };
  }
  let [g, h, d, b] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of points) {
    g = Math.min(g, p.x);
    d = Math.max(d, p.x);
    h = Math.min(h, p.y);
    b = Math.max(b, p.y);
  }
  const hauteur = Math.max(b - h + 2 * margeY, (d - g + 2 * margeX) / ratio, hauteurMin);
  return { x: (g + d) / 2, y: (h + b) / 2, hauteurVue: Math.min(hauteur, hauteurMax) };
}

/** Rapproche une valeur de sa cible, en douceur (constante de temps en ms). */
export function lisser(valeur: number, cible: number, dtMs: number, constanteMs: number): number {
  return valeur + (cible - valeur) * (1 - Math.exp(-Math.max(0, dtMs) / constanteMs));
}
