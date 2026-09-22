import { TICKS_PAR_SECONDE } from "./constantes";

/*
 * Horloge à pas fixe : convertit le temps réel écoulé en un nombre
 * entier de ticks à simuler. La simulation avance donc toujours par pas
 * de 1/60 s, que l'écran affiche 60 ou 144 images par seconde.
 *
 * Le reliquat est compté en millièmes de tick (ms × 60) pour que des
 * durées rondes tombent juste : 1 000 ms donnent exactement 60 ticks.
 * Le temps lui-même est fourni par l'appelant ; le noyau n'a pas d'horloge.
 */

/** Au-delà, le retard est abandonné (onglet en arrière-plan, pause du débogueur…). */
export const RATTRAPAGE_MAX = 5;

export type Horloge = { reste: number };

export function creerHorloge(): Horloge {
  return { reste: 0 };
}

export function ticksAJouer(h: Horloge, ecouleMs: number): number {
  h.reste += Math.max(0, ecouleMs) * TICKS_PAR_SECONDE;
  const n = Math.floor(h.reste / 1000);
  h.reste -= n * 1000;
  return Math.min(n, RATTRAPAGE_MAX);
}

/** Avancement dans le tick en cours, dans [0, 1[ : sert à interpoler l'affichage. */
export function fractionTick(h: Horloge): number {
  return h.reste / 1000;
}
