import type { Periode } from "./types";

/*
 * Colloscope MP2I 2026-2027, premier semestre.
 * Source : « 26-27 MP2I - colloscope S1.pdf » (liste des colleurs et
 * leurs créneaux, page 1 ; planning des groupes, page 2).
 *
 * La composition nominative des groupes n'est volontairement pas
 * reprise : chaque membre renseigne son numéro dans son profil.
 */
export const S1_2026_2027: Periode = {
  id: "2026-2027-S1",
  anneeScolaire: "2026-2027",
  libelle: "Semestre 1",
  source: "26-27 MP2I - colloscope S1.pdf",
  groupes: 16,

  semaines: [
    { numero: 1, date: "2026-09-21" },
    { numero: 2, date: "2026-09-28" },
    { numero: 3, date: "2026-10-05" },
    { numero: 4, date: "2026-10-12" },
    { numero: 5, date: "2026-11-02" },
    { numero: 6, date: "2026-11-16" },
    { numero: 7, date: "2026-11-23" },
    {
      numero: 8, date: "2026-12-01",
      note: "Le colloscope date cette semaine du mardi 1er décembre.",
    },
    { numero: 9, date: "2026-12-07" },
    { numero: 10, date: "2026-12-14" },
    { numero: 11, date: "2027-01-04" },
    { numero: 12, date: "2027-01-11" },
    { numero: 13, date: "2027-01-18" },
    { numero: 14, date: "2027-01-25" },
  ],

  creneaux: [
    // Anglais et physique (deuxième colonne A / P).
    { code: "A1", matiere: "A", colleur: "Mme Talent", horaire: { jour: 3, debut: "15:00", fin: "16:00", salle: "N 16" } },
    { code: "P1", matiere: "P", colleur: "M. Lao", horaire: { jour: 3, debut: "16:00", fin: "17:00", salle: "N 24" } },
    { code: "A2", matiere: "A", colleur: "Mme Monnier", horaire: { jour: 3, debut: "15:00", fin: "16:00", salle: "N 25" } },
    {
      code: "P2", matiere: "P", colleur: "M. Pricoupenko",
      horaire: { jour: 1, debut: "17:00", fin: "18:00", salle: "N 11" },
      alternative: {
        jour: 5, debut: "18:00", fin: "19:00", salle: "RF 31",
        condition: "les semaines où il y a informatique le lundi",
      },
      note: "Les colles P2 de M. Pricoupenko ont lieu le lundi lorsqu’il n’y a pas informatique. Sinon, la colle se passe le vendredi.",
    },
    { code: "A3", matiere: "A", colleur: "Mme Talent", horaire: { jour: 4, debut: "17:30", fin: "18:30", salle: "N 16" } },
    { code: "P3", matiere: "P", colleur: "Mme Passicos", horaire: { jour: 4, debut: "17:00", fin: "18:00", salle: "N 22" } },
    { code: "A4", matiere: "A", colleur: "Mme Monnier", horaire: { jour: 4, debut: "17:30", fin: "18:30", salle: "N 21" } },
    { code: "P4", matiere: "P", colleur: "M. Ferrer", horaire: { jour: 4, debut: "18:00", fin: "19:00", salle: "N 15" } },
    { code: "A5", matiere: "A", colleur: "Mme Talent", horaire: { jour: 3, debut: "16:00", fin: "17:00", salle: "N 16" } },
    { code: "P5", matiere: "P", colleur: "M. Toulemonde", horaire: { jour: 5, debut: "18:00", fin: "19:00", salle: "N 17" } },
    { code: "A6", matiere: "A", colleur: "Mme Monnier", horaire: { jour: 3, debut: "18:00", fin: "19:00", salle: "N 25" } },
    { code: "P6", matiere: "P", colleur: "M. Pricoupenko", horaire: { jour: 4, debut: "17:00", fin: "18:00", salle: "N 23" } },
    { code: "A7", matiere: "A", colleur: "Mme Talent", horaire: { jour: 4, debut: "18:30", fin: "19:30", salle: "N 16" } },
    { code: "P7", matiere: "P", colleur: "Mme Passicos", horaire: { jour: 4, debut: "18:00", fin: "19:00", salle: "N 22" } },
    { code: "A8", matiere: "A", colleur: "Mme Monnier", horaire: { jour: 4, debut: "18:30", fin: "19:30", salle: "N 21" } },
    { code: "P8", matiere: "P", colleur: "M. Ferrer", horaire: { jour: 5, debut: "18:00", fin: "19:00", salle: "N 11" } },

    // Mathématiques (M4, M8, M12 et M16 sont des semaines de repos).
    { code: "M1", matiere: "M", colleur: "M. Raulet", horaire: { jour: 4, debut: "17:00", fin: "18:00", salle: "F 04" } },
    { code: "M2", matiere: "M", colleur: "Mme Révol", horaire: { jour: 4, debut: "16:00", fin: "17:00", salle: "F 01" } },
    { code: "M3", matiere: "M", colleur: "M. Prat", horaire: { jour: 4, debut: "17:00", fin: "18:00", salle: "N 26" } },
    { code: "M5", matiere: "M", colleur: "M. Zaroil", horaire: { jour: 3, debut: "15:00", fin: "16:00", salle: "N 23" } },
    { code: "M6", matiere: "M", colleur: "M. Labit", horaire: { jour: 3, debut: "15:00", fin: "16:00", salle: "N 14" } },
    { code: "M7", matiere: "M", colleur: "M. Corbineau", horaire: { jour: 2, debut: "17:00", fin: "18:00", salle: "N 13" } },
    { code: "M9", matiere: "M", colleur: "M. Raulet", horaire: { jour: 4, debut: "18:00", fin: "19:00", salle: "F 04" } },
    { code: "M10", matiere: "M", colleur: "Mme Révol", horaire: { jour: 4, debut: "17:00", fin: "18:00", salle: "F 01" } },
    { code: "M11", matiere: "M", colleur: "M. Prat", horaire: { jour: 4, debut: "18:00", fin: "19:00", salle: "N 26" } },
    { code: "M13", matiere: "M", colleur: "M. Zaroil", horaire: { jour: 3, debut: "16:00", fin: "17:00", salle: "N 23" } },
    { code: "M14", matiere: "M", colleur: "M. Labit", horaire: { jour: 3, debut: "16:00", fin: "17:00", salle: "N 14" } },
    { code: "M15", matiere: "M", colleur: "M. Corbineau", horaire: { jour: 2, debut: "18:00", fin: "19:00", salle: "N 13" } },

    // Français, les semaines de repos en maths.
    { code: "F4", matiere: "F", colleur: "M. Raquin", horaire: { jour: 3, debut: "13:00", fin: "14:30", salle: "N 01" } },
    { code: "F12", matiere: "F", colleur: "M. Raquin", horaire: { jour: 3, debut: "14:30", fin: "16:00", salle: "N 01" } },
  ],

  rotations: {
    C1: ["A1", "M1"],
    C2: ["P1", "M2"],
    C3: ["A2", "M3"],
    C4: ["P2", "F4"],
    C5: ["A3", "M5"],
    C6: ["P3", "M6"],
    C7: ["A4", "M7"],
    C8: ["P4"],
    C9: ["A5", "M9"],
    C10: ["P5", "M10"],
    C11: ["A6", "M11"],
    C12: ["P6", "F12"],
    C13: ["A7", "M13"],
    C14: ["P7", "M14"],
    C15: ["A8", "M15"],
    C16: ["P8"],
  },

  notesRotation: {
    C4: "Repos en mathématiques (M4)\u00a0: colle de français à la place.",
    C8: "Repos en mathématiques (M8).",
    C12: "Repos en mathématiques (M12)\u00a0: colle de français à la place.",
    C16: "Repos en mathématiques (M16).",
  },

  planning: {
     1: ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11", "C12", "C13", "C14"],
     2: ["C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15"],
     3: ["C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16"],
     4: ["C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16", "C1"],
     5: ["C5", "C6", "C7", "C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16", "C1", "C2"],
     6: ["C6", "C7", "C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16", "C1", "C2", "C3"],
     7: ["C7", "C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16", "C1", "C2", "C3", "C4"],
     8: ["C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16", "C1", "C2", "C3", "C4", "C5"],
     9: ["C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16", "C1", "C2", "C3", "C4", "C5", "C6"],
    10: ["C10", "C11", "C12", "C13", "C14", "C15", "C16", "C1", "C2", "C3", "C4", "C5", "C6", "C7"],
    11: ["C11", "C12", "C13", "C14", "C15", "C16", "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"],
    12: ["C12", "C13", "C14", "C15", "C16", "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9"],
    13: ["C13", "C14", "C15", "C16", "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10"],
    14: ["C14", "C15", "C16", "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11"],
    15: ["C15", "C16", "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11", "C12"],
    16: ["C16", "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11", "C12", "C13"],
  },

  notes: [
    "Les élèves suivant une LV2 (espagnol ou allemand) doivent s’organiser lorsqu’une colle se déroule pendant cette heure de langue\u00a0: il suffit de permuter avec un autre élève (qui doit avoir le même colleur) pour assister à la fois au cours et à la colle.",
  ],
};
