import type { Monde } from "./monde";

/*
 * Événements d'un tick : ce qui s'est passé, pour les effets visuels et
 * sonores du client. Ils ne pilotent jamais la simulation.
 *
 * Forme unique pour tous les types (champs inutilisés à -1 / 0 / "") :
 * c'est plus simple à sérialiser et à rejouer.
 */

export type TypeEvenement =
  | "touche" | "armure" | "contre" | "ko" | "chute"
  | "coup" | "saut" | "dash" | "atterrissage" | "phase";

export type Evenement = {
  type: TypeEvenement;
  /** Combattant à l'origine (attaquant, sauteur…), -1 sinon. */
  source: number;
  /** Combattant qui subit, -1 sinon. */
  cible: number;
  x: number;
  y: number;
  /** Dégâts, force du recul, numéro de manche… selon le type. */
  valeur: number;
  /** Coup, effet visuel ou phase concernés. */
  cle: string;
};

export function emettre(monde: Monde, e: Partial<Evenement> & { type: TypeEvenement }): void {
  monde.evenements.push({ source: -1, cible: -1, x: 0, y: 0, valeur: 0, cle: "", ...e });
}
