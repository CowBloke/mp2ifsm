import type { Matiere } from "../constantes";
import { S1_2026_2027 } from "./2026-2027-s1";
import type { CodeMatiereColle, ColleDatee, Heure, Horaire, Periode } from "./types";

export type { CodeMatiereColle, ColleDatee, Creneau, Periode, Semaine } from "./types";

/*
 * Colloscopes connus, du plus ancien au plus récent. Pour un nouveau
 * semestre : créer le fichier de données et l'ajouter ici.
 */
export const PERIODES: readonly Periode[] = [S1_2026_2027];

/*
 * Lettre du PDF → matière. `legacy` relie la colle à la matière gérée
 * par les administrateurs (subject.legacy) : un renommage ou un
 * changement de couleur se reflète donc aussi dans le colloscope.
 */
export const MATIERES_COLLES: Record<CodeMatiereColle, { nom: string; legacy: Matiere }> = {
  A: { nom: "Anglais", legacy: "Anglais" },
  P: { nom: "Physique", legacy: "Physique" },
  M: { nom: "Mathématiques", legacy: "Maths" },
  F: { nom: "Français", legacy: "Français" },
};

/** Plus grand numéro de groupe, toutes périodes confondues. */
export const GROUPE_MAX = Math.max(...PERIODES.map((p) => p.groupes));

export function groupeValide(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= GROUPE_MAX;
}

/* ------------------------------------------------------------------ */
/* Dates : le colloscope est en heure de Paris, le serveur peut ne pas  */
/* l'être.                                                             */
/* ------------------------------------------------------------------ */

const FORMAT_PARIS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Paris", hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});

function partiesParis(d: Date) {
  const p = Object.fromEntries(FORMAT_PARIS.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute };
}

/** Jour calendaire à Paris, "YYYY-MM-DD". */
export function jourParis(d: Date): string {
  const p = partiesParis(d);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** Instant correspondant à une heure murale de Paris. */
export function dateParis(jour: string, heure: Heure | string): Date {
  const [y, m, d] = jour.split("-").map(Number);
  const [h, min] = heure.split(":").map(Number);
  const naif = Date.UTC(y, m - 1, d, h, min);
  // Deux passes : la seconde corrige le cas où la première estimation
  // tombe de l'autre côté d'un changement d'heure.
  let t = naif;
  for (let i = 0; i < 2; i++) {
    const p = partiesParis(new Date(t));
    const decalage = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - t;
    t = naif - decalage;
  }
  return new Date(t);
}

export function ajouterJours(jour: string, n: number): string {
  const [y, m, d] = jour.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Lundi de la semaine contenant `jour` ("YYYY-MM-DD"). */
export function lundiDe(jour: string): string {
  const [y, m, d] = jour.split("-").map(Number);
  const jourSemaine = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = dimanche
  return ajouterJours(jour, -((jourSemaine + 6) % 7));
}

/* ------------------------------------------------------------------ */
/* Lecture du colloscope                                               */
/* ------------------------------------------------------------------ */

function horaireDate(lundi: string, h: Horaire) {
  const jour = ajouterJours(lundi, h.jour - 1);
  return { debut: dateParis(jour, h.debut), fin: dateParis(jour, h.fin), salle: h.salle };
}

/** Colles d'un groupe pour une semaine donnée d'une période. */
function collesSemaine(periode: Periode, index: number, groupe: number): ColleDatee[] {
  const semaine = periode.semaines[index];
  const rotation = periode.planning[groupe]?.[index];
  if (!semaine || !rotation) return [];
  const lundi = lundiDe(semaine.date);

  return (periode.rotations[rotation] ?? []).flatMap((code) => {
    const c = periode.creneaux.find((x) => x.code === code);
    if (!c) return [];
    const h = horaireDate(lundi, c.horaire);
    const notes = [c.note, semaine.note].filter((n): n is string => Boolean(n));
    return [{
      id: `${periode.id}:${semaine.numero}:${groupe}:${code}`,
      periode: periode.id,
      semaine: semaine.numero,
      groupe,
      rotation,
      creneau: code,
      matiere: c.matiere,
      colleur: c.colleur,
      debut: h.debut,
      fin: h.fin,
      salle: h.salle,
      alternative: c.alternative
        ? { ...horaireDate(lundi, c.alternative), condition: c.alternative.condition }
        : undefined,
      notes,
    }];
  });
}

/**
 * Colles d'un groupe dont le créneau (ou son repli) n'est pas terminé
 * avant `debut` et commence avant `fin`, triées par date.
 */
export function collesDuGroupe(groupe: number, debut: Date, fin: Date): ColleDatee[] {
  if (!groupeValide(groupe)) return [];
  const out: ColleDatee[] = [];
  for (const p of PERIODES) {
    if (groupe > p.groupes) continue;
    for (let i = 0; i < p.semaines.length; i++) {
      for (const c of collesSemaine(p, i, groupe)) {
        const finReelle = c.alternative && c.alternative.fin > c.fin ? c.alternative.fin : c.fin;
        if (finReelle > debut && c.debut < fin) out.push(c);
      }
    }
  }
  return out.sort((a, b) => a.debut.getTime() - b.debut.getTime());
}

export type SemaineColles = {
  lundi: string;
  periode: Periode | null;
  numero: number | null;
  rotation: string | null;
  colles: ColleDatee[];
  /** Remarques propres à cette semaine (repos, date atypique…). */
  notes: string[];
};

/** Semaine (lundi "YYYY-MM-DD") vue par un groupe. */
export function semaineDuGroupe(groupe: number, lundi: string): SemaineColles {
  for (const p of PERIODES) {
    const i = p.semaines.findIndex((s) => lundiDe(s.date) === lundi);
    if (i < 0) continue;
    const s = p.semaines[i];
    const rotation = groupeValide(groupe) ? p.planning[groupe]?.[i] ?? null : null;
    return {
      lundi,
      periode: p,
      numero: s.numero,
      rotation,
      colles: rotation
        ? collesSemaine(p, i, groupe).sort((a, b) => a.debut.getTime() - b.debut.getTime())
        : [],
      notes: [s.note, rotation ? p.notesRotation?.[rotation] : undefined]
        .filter((n): n is string => Boolean(n)),
    };
  }
  return { lundi, periode: null, numero: null, rotation: null, colles: [], notes: [] };
}

/** Période qui couvre `jour`, sinon la prochaine, sinon la dernière. */
export function periodeCourante(jour: string): Periode | null {
  const lundi = lundiDe(jour);
  const bornes = PERIODES.map((p) => ({
    p,
    debut: lundiDe(p.semaines[0].date),
    fin: ajouterJours(lundiDe(p.semaines[p.semaines.length - 1].date), 6),
  }));
  return bornes.find((b) => b.debut <= lundi && lundi <= b.fin)?.p
    ?? bornes.find((b) => b.debut > lundi)?.p
    ?? bornes.at(-1)?.p
    ?? null;
}
