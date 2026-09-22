import type { Boite } from "./collisions";
import { px } from "./constantes";

/*
 * Une carte n'est que de la donnée : des blocs pleins et des points
 * d'apparition. Son apparence est l'affaire du client.
 */

export type Point = { x: number; y: number };

export type Carte = {
  /** Étendue de l'arène : la caméra ne montre jamais au-delà. */
  limites: Boite;
  /** Blocs pleins (sol, murs, plateformes), bloquants de tous côtés. */
  solides: readonly Boite[];
  /** Pieds des combattants au départ, un point par place. */
  apparitions: readonly Point[];
};

/** Bloc décrit en pixels, converti en unités. */
export function bloc(x: number, y: number, largeur: number, hauteur: number): Boite {
  return { gauche: px(x), haut: px(y), droite: px(x + largeur), bas: px(y + hauteur) };
}
