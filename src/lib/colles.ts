import "server-only";
import { query } from "./db";
import {
  MATIERES_COLLES, collesDuGroupe, semaineDuGroupe,
  type CodeMatiereColle, type ColleDatee, type SemaineColles,
} from "./colloscope";

/*
 * Colles vues par l'interface. Le colloscope (code) donne les créneaux ;
 * la base donne le nom et la couleur actuels de chaque matière, pour
 * que le colloscope suive les réglages des administrateurs.
 */

export type ColleVue = Omit<ColleDatee, "debut" | "fin" | "alternative" | "matiere"> & {
  code: CodeMatiereColle;
  matiere: string;
  couleur: string | null;
  debut: string;
  fin: string;
  alternative?: { debut: string; fin: string; salle: string; condition: string };
};

type MatieresColles = Record<CodeMatiereColle, { nom: string; couleur: string | null }>;

async function matieresColles(): Promise<MatieresColles> {
  const lignes = await query<{ legacy: string; nom: string; couleur: string }>(
    `select legacy::text as legacy, nom, couleur from subject where legacy is not null`,
  );
  const parLegacy = new Map(lignes.map((l) => [l.legacy, l]));
  const out = {} as MatieresColles;
  for (const [code, m] of Object.entries(MATIERES_COLLES) as Array<[CodeMatiereColle, typeof MATIERES_COLLES.A]>) {
    const s = parLegacy.get(m.legacy);
    out[code] = { nom: s?.nom ?? m.nom, couleur: s?.couleur ?? null };
  }
  return out;
}

function vue(c: ColleDatee, m: MatieresColles): ColleVue {
  return {
    ...c,
    code: c.matiere,
    matiere: m[c.matiere].nom,
    couleur: m[c.matiere].couleur,
    debut: c.debut.toISOString(),
    fin: c.fin.toISOString(),
    alternative: c.alternative && {
      ...c.alternative,
      debut: c.alternative.debut.toISOString(),
      fin: c.alternative.fin.toISOString(),
    },
  };
}

/** Prochaines colles d'un groupe (en cours comprises). */
export async function prochainesColles(
  groupe: number, limite = 4, horizonJours = 60, maintenant = new Date(),
): Promise<ColleVue[]> {
  const fin = new Date(maintenant.getTime() + horizonJours * 86_400_000);
  const colles = collesDuGroupe(groupe, maintenant, fin).slice(0, limite);
  if (colles.length === 0) return [];
  const m = await matieresColles();
  return colles.map((c) => vue(c, m));
}

export type SemaineVue = Omit<SemaineColles, "colles" | "periode"> & {
  periode: { id: string; libelle: string; anneeScolaire: string; notes: string[] } | null;
  colles: ColleVue[];
};

export async function semaineColles(groupe: number, lundi: string): Promise<SemaineVue> {
  const s = semaineDuGroupe(groupe, lundi);
  const m = await matieresColles();
  return {
    ...s,
    periode: s.periode && {
      id: s.periode.id, libelle: s.periode.libelle,
      anneeScolaire: s.periode.anneeScolaire, notes: s.periode.notes,
    },
    colles: s.colles.map((c) => vue(c, m)),
  };
}

/* ------------------------------------------------------------------ */
/* Affichage, toujours en heure de Paris                               */
/* ------------------------------------------------------------------ */

const TZ = "Europe/Paris";

/* Espaces insécables : « 17 h 30 » et « N 16 » ne se coupent jamais en
 * fin de ligne, et un tiret ne commence jamais une ligne. */
const FINE = "\u202f";
const INSECABLE = "\u00a0";

/** « 17 h », « 17 h 30 ». */
export function heure(iso: string): string {
  const [h, m] = new Date(iso)
    .toLocaleTimeString("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })
    .split(":");
  return m === "00" ? `${Number(h)}${FINE}h` : `${Number(h)}${FINE}h${FINE}${m}`;
}

/** « 17 h – 18 h ». */
export function plage(debut: string, fin: string): string {
  return `${heure(debut)}${INSECABLE}– ${heure(fin)}`;
}

/** « N 16 » insécable. */
export function salle(nom: string): string {
  return nom.replace(/ /g, INSECABLE);
}

/**
 * « de physique », « d’anglais », « de mathématiques » : complément
 * « colle de … » avec élision et minuscule (sigles conservés : « de SI »).
 */
export function deMatiere(nom: string): string {
  const sigle = nom.length > 1 && nom === nom.toUpperCase();
  const mot = sigle ? nom : nom.charAt(0).toLocaleLowerCase("fr") + nom.slice(1);
  return /^[aeiouyhâàéèêîïôû]/i.test(mot) && !sigle ? `d’${mot}` : `de ${mot}`;
}

/** « jeu. 24 sept. » */
export function jourCourt(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    timeZone: TZ, weekday: "short", day: "numeric", month: "short",
  });
}
