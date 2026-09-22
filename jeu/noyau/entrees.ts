/*
 * Entrées d'un joueur pour UN tick : un champ de bits.
 *
 * C'est tout ce qu'un client aura le droit d'envoyer au serveur : ni
 * position, ni vitesse. Les appuis (front montant) sont déduits par la
 * simulation elle-même, à partir de l'entrée du tick précédent.
 */

export type Entree = number;

export const AUCUNE: Entree = 0;
export const GAUCHE: Entree = 1 << 0;
export const DROITE: Entree = 1 << 1;
export const SAUT: Entree = 1 << 2;
export const DASH: Entree = 1 << 3;
