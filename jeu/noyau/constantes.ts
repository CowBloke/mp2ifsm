/*
 * Constantes de la simulation.
 *
 * L'état du jeu est entièrement en entiers : une longueur vaut
 * SOUS_PIXELS unités par pixel, une vitesse s'exprime en unités par
 * tick. Aucun arrondi flottant ne peut donc diverger entre le serveur
 * et un navigateur, et un état se compare ou se sérialise exactement.
 */

export const TICKS_PAR_SECONDE = 60;
/** Durée d'un tick en millisecondes (pour les horloges, jamais pour l'état). */
export const MS_PAR_TICK = 1000 / TICKS_PAR_SECONDE;
export const SOUS_PIXELS = 100;

/** Pixels → unités de simulation (pour écrire les données lisiblement). */
export function px(pixels: number): number {
  return Math.round(pixels * SOUS_PIXELS);
}
