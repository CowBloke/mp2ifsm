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
