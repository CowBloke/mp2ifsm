/*
 * Constantes partagées entre serveur et client.
 *
 * Ce module n'importe rien du serveur, il peut donc être utilisé par
 * un composant client sans entraîner `pg` dans le bundle du navigateur.
 */

/** Ancien enum SQL `matiere` : ne sert plus qu'à la compatibilité. */
export const MATIERES = ["Maths", "Physique", "Chimie", "SI", "Français", "Anglais"] as const;
export type Matiere = (typeof MATIERES)[number];

/*
 * Palette fixe des matières. Les teintes (même luminance et même
 * saturation, variantes claire et sombre) sont définies dans
 * globals.css sous --matiere-<cle>. Garder cette liste identique à la
 * contrainte CHECK de subject.couleur (db/schema-etudes.sql).
 */
export const PALETTE = [
  { cle: "rouge", nom: "Rouge" },
  { cle: "orange", nom: "Orange" },
  { cle: "ambre", nom: "Ambre" },
  { cle: "olive", nom: "Olive" },
  { cle: "vert", nom: "Vert" },
  { cle: "sarcelle", nom: "Sarcelle" },
  { cle: "cyan", nom: "Cyan" },
  { cle: "bleu", nom: "Bleu" },
  { cle: "indigo", nom: "Indigo" },
  { cle: "violet", nom: "Violet" },
  { cle: "magenta", nom: "Magenta" },
  { cle: "rose", nom: "Rose" },
] as const;
export type CouleurMatiere = (typeof PALETTE)[number]["cle"];
export const CLES_PALETTE = PALETTE.map((p) => p.cle) as unknown as readonly [CouleurMatiere, ...CouleurMatiere[]];

/** Matière telle que l'affichent les composants. */
export type MatiereVue = {
  id: number;
  nom: string;
  couleur: CouleurMatiere;
  archivee: boolean;
};

/** Couleur CSS d'une matière ; « sans matière » reste neutre. */
export function couleurMatiere(couleur: string | null | undefined): string {
  return couleur ? `var(--matiere-${couleur})` : "var(--muted-foreground)";
}

export const TYPES_ECHEANCE = ["DS", "DM", "Colle", "TIPE", "Oral", "Projet", "Autre"] as const;

export const CATEGORIES_RETOUR = [
  { cle: "idee", nom: "Idée" },
  { cle: "bug", nom: "Bug" },
  { cle: "autre", nom: "Autre" },
] as const;
export type CategorieRetour = (typeof CATEGORIES_RETOUR)[number]["cle"];

export const STATUTS_RETOUR = [
  { cle: "ouvert", nom: "Ouvert" },
  { cle: "prevu", nom: "Prévu" },
  { cle: "refuse", nom: "Refusé" },
  { cle: "termine", nom: "Terminé" },
] as const;
export type StatutRetour = (typeof STATUTS_RETOUR)[number]["cle"];

export const NOM_CATEGORIE: Record<string, string> =
  Object.fromEntries(CATEGORIES_RETOUR.map((c) => [c.cle, c.nom]));
export const NOM_STATUT: Record<string, string> =
  Object.fromEntries(STATUTS_RETOUR.map((s) => [s.cle, s.nom]));

/** Jours de rétention d'un document supprimé avant effacement réel. */
export const JOURS_AVANT_PURGE = 30;
