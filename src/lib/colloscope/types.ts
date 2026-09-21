/*
 * Modèle du colloscope.
 *
 * Un colloscope couvre une période (un semestre d'une année scolaire)
 * et se lit comme le PDF distribué :
 *
 *   - des créneaux (A1, P2, M5, F4…) : matière, colleur, jour, heure, salle ;
 *   - des rotations (C1…C16) : les créneaux qu'un groupe a la même semaine ;
 *   - un planning : pour chaque groupe, la rotation de chaque semaine.
 *
 * Ajouter un semestre = écrire un nouveau fichier de données (voir
 * 2026-2027-s1.ts) et l'ajouter à PERIODES dans index.ts. Aucune
 * migration SQL n'est nécessaire : seul le numéro de groupe du membre
 * est en base.
 */

/** Lettre de la deuxième colonne du PDF. */
export type CodeMatiereColle = "A" | "P" | "M" | "F";

/** 1 = lundi … 6 = samedi. */
export type Jour = 1 | 2 | 3 | 4 | 5 | 6;

/** Heure murale à Paris, "HH:MM". */
export type Heure = `${number}:${number}`;

export type Horaire = {
  jour: Jour;
  debut: Heure;
  fin: Heure;
  salle: string;
};

export type Creneau = {
  /** Code du PDF : "A1", "P2", "M13", "F4"… */
  code: string;
  matiere: CodeMatiereColle;
  colleur: string;
  horaire: Horaire;
  /** Horaire de repli quand le créneau habituel n'a pas lieu. */
  alternative?: Horaire & { condition: string };
  /** Remarque propre à ce créneau, reprise du PDF. */
  note?: string;
};

export type Semaine = {
  /** Numéro de colle du PDF (« colle 1 », « colle 2 »…). */
  numero: number;
  /** Date imprimée en tête de colonne, "YYYY-MM-DD". La semaine est
   *  celle (lundi → samedi) qui contient cette date. */
  date: string;
  note?: string;
};

export type Periode = {
  /** Identifiant stable, ex. "2026-2027-S1". */
  id: string;
  anneeScolaire: string;
  libelle: string;
  /** Document d'origine, pour retrouver la source d'une donnée. */
  source: string;
  /** Groupes numérotés de 1 à `groupes`. */
  groupes: number;
  semaines: Semaine[];
  creneaux: Creneau[];
  /** Rotation → codes de créneaux. Une case « repos » est simplement absente. */
  rotations: Record<string, string[]>;
  /** Groupe → rotation de chaque semaine, dans l'ordre de `semaines`. */
  planning: Record<number, string[]>;
  /** Remarque attachée à une rotation (ex. semaine de repos en maths). */
  notesRotation?: Record<string, string>;
  /** Consignes générales imprimées sur le colloscope. */
  notes: string[];
};

/** Une colle datée, prête à afficher. */
export type ColleDatee = {
  id: string;
  periode: string;
  semaine: number;
  groupe: number;
  rotation: string;
  creneau: string;
  matiere: CodeMatiereColle;
  colleur: string;
  debut: Date;
  fin: Date;
  salle: string;
  alternative?: { debut: Date; fin: Date; salle: string; condition: string };
  notes: string[];
};
