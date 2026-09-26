/*
 * Entrées d'un joueur pour UN tick : un champ de bits.
 *
 * C'est tout ce qu'un client aura le droit d'envoyer au serveur : ni
 * position, ni vitesse, ni dégâts. Les appuis (front montant) sont
 * déduits par la simulation, à partir de l'entrée du tick précédent.
 */

export type Entree = number;

export const AUCUNE: Entree = 0;
export const GAUCHE: Entree = 1 << 0;
export const DROITE: Entree = 1 << 1;
export const HAUT: Entree = 1 << 2;
export const BAS: Entree = 1 << 3;
export const SAUT: Entree = 1 << 4;
export const DASH: Entree = 1 << 5;
export const ATTAQUE: Entree = 1 << 6;
export const SPECIAL: Entree = 1 << 7;
export const ULTIME: Entree = 1 << 8;

/** Boutons d'action : leurs appuis sont gardés en mémoire quelques ticks. */
export const ACTIONS: Entree = SAUT | DASH | ATTAQUE | SPECIAL | ULTIME;
/** Masque de tous les bits valides : le serveur ignore le reste. */
export const TOUTES: Entree = (1 << 9) - 1;

/** -1, 0 ou 1 selon les directions horizontales tenues. */
export function directionX(e: Entree): -1 | 0 | 1 {
  const d = (e & DROITE ? 1 : 0) - (e & GAUCHE ? 1 : 0);
  return d > 0 ? 1 : d < 0 ? -1 : 0;
}
