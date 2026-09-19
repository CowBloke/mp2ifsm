/*
 * Constantes partagées entre serveur et client.
 *
 * Ce module n'importe rien du serveur, il peut donc être utilisé par
 * un composant client sans entraîner `pg` dans le bundle du navigateur.
 */
export const MATIERES = ["Maths", "Physique", "Chimie", "SI", "Français", "Anglais"] as const;
export type Matiere = (typeof MATIERES)[number];

export const TYPES_ECHEANCE = ["DS", "DM", "Colle", "TIPE", "Oral", "Projet", "Autre"] as const;

/** Plafond de cartes neuves servies par jour et par paquet. */
export const NOUVELLES_PAR_JOUR = 20;

/** Jours de rétention d'un document supprimé avant effacement réel. */
export const JOURS_AVANT_PURGE = 30;
