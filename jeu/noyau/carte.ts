import type { Boite, Plateforme } from "./collisions";
import { px } from "./constantes";

/*
 * Une carte n'est que de la donnée : des blocs pleins, des plateformes
 * traversables, une zone de vie et des points d'apparition. Son
 * apparence est l'affaire du client.
 */

export type Point = { x: number; y: number };

export type Carte = {
  id: string;
  nom: string;
  /** Étendue montrée par les caméras. */
  limites: Boite;
  /** Sortir entièrement de cette zone, c'est chuter. */
  zoneVie: Boite;
  /** Blocs pleins, bloquants de tous côtés. */
  solides: readonly Boite[];
  /** Plateformes que l'on traverse par le dessous. */
  plateformes: readonly Plateforme[];
  /** Pieds des combattants au départ de chaque manche, un point par place. */
  apparitions: readonly Point[];
};

/** Bloc décrit en pixels, converti en unités. */
export function bloc(x: number, y: number, largeur: number, hauteur: number): Boite {
  return { gauche: px(x), haut: px(y), droite: px(x + largeur), bas: px(y + hauteur) };
}

/** Plateforme décrite en pixels : bord gauche, hauteur de la surface, largeur. */
export function plateforme(x: number, y: number, largeur: number): Plateforme {
  return { gauche: px(x), droite: px(x + largeur), y: px(y) };
}

/** Point décrit en pixels. */
export function point(x: number, y: number): Point {
  return { x: px(x), y: px(y) };
}
