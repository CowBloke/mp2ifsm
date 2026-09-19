import "server-only";
import {
  fsrs, generatorParameters, createEmptyCard, Rating, State,
  type Card as CarteFSRS, type RecordLogItem, type Grade,
} from "ts-fsrs";

/*
 * Pont entre ts-fsrs et la base.
 *
 * Toute la planification vit ici, côté serveur. Le client ne calcule
 * jamais une date d'échéance : même les intervalles affichés au-dessus
 * des quatre boutons sont calculés ici et envoyés avec la carte.
 */

// Rétention cible 0,9 : le réglage par défaut de FSRS, adapté à un
// usage quotidien sur un semestre de prépa. Sans fuzz, les aperçus
// et la planification utilisent le même calcul déterministe.
export const PARAMETRES = generatorParameters({
  enable_fuzz: false,
  enable_short_term: true,
});

const moteur = fsrs(PARAMETRES);

export const NOTES = [
  { note: Rating.Again, cle: "again", label: "Encore",   touche: "1" },
  { note: Rating.Hard,  cle: "hard",  label: "Difficile", touche: "2" },
  { note: Rating.Good,  cle: "good",  label: "Correct",  touche: "3" },
  { note: Rating.Easy,  cle: "easy",  label: "Facile",   touche: "4" },
] as const;

export type CleNote = (typeof NOTES)[number]["cle"];

const PAR_CLE: Record<CleNote, Grade> = {
  again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy,
};

export function noteDepuisCle(cle: string): Grade | null {
  return Object.hasOwn(PAR_CLE, cle) ? PAR_CLE[cle as CleNote] : null;
}

/** Ligne `card_state` telle que stockée. */
export type EtatDb = {
  state: "New" | "Learning" | "Review" | "Relearning";
  due: string | Date;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  last_review: string | Date | null;
};

const ETATS = ["New", "Learning", "Review", "Relearning"] as const;

export function versFSRS(row: EtatDb | null, maintenant: Date): CarteFSRS {
  if (!row) return createEmptyCard(maintenant);
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: ETATS.indexOf(row.state) as State,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  };
}

export function versDb(c: CarteFSRS) {
  return {
    state: ETATS[c.state],
    due: c.due,
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: Math.max(0, Math.round(c.elapsed_days)),
    scheduled_days: Math.max(0, Math.round(c.scheduled_days)),
    learning_steps: c.learning_steps ?? 0,
    reps: c.reps,
    lapses: c.lapses,
    last_review: c.last_review ?? null,
  };
}

/** Applique une note et renvoie le nouvel état + la ligne de journal. */
export function noter(
  etat: EtatDb | null,
  note: Grade,
  maintenant: Date,
): RecordLogItem {
  return moteur.next(versFSRS(etat, maintenant), maintenant, note);
}

/** Keep the previewed interval, measured from the actual submission time. */
export function noterProjection(etat: EtatDb | null, note: Grade, apercu: Date, soumission: Date): RecordLogItem {
  const resultat = noter(etat, note, apercu);
  const intervalle = resultat.card.due.getTime() - apercu.getTime();
  resultat.card.due = new Date(soumission.getTime() + intervalle);
  resultat.card.last_review = soumission;
  return resultat;
}

/**
 * Les quatre issues possibles, pour afficher l'intervalle au-dessus de
 * chaque bouton avant que l'utilisateur ne choisisse.
 */
export type Apercu = { cle: CleNote; label: string; touche: string; intervalle: string };

export function apercuIntervalles(etat: EtatDb | null, maintenant: Date): Apercu[] {
  const projection = moteur.repeat(versFSRS(etat, maintenant), maintenant);
  return NOTES.map(({ note, cle, label, touche }) => ({
    cle,
    label,
    touche,
    intervalle: formatIntervalle(projection[note].card.due, maintenant),
  }));
}

/** « 10 min », « 3 j », « 2,1 mois » — l'unité qu'un humain lit vite. */
export function formatIntervalle(due: Date, depuis: Date): string {
  const ms = due.getTime() - depuis.getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;

  const heures = ms / 3_600_000;
  if (heures < 24) return `${Math.round(heures)} h`;

  const jours = ms / 86_400_000;
  if (jours < 31) return `${Math.round(jours)} j`;
  if (jours < 365) return `${(jours / 30.44).toFixed(1).replace(".", ",")} mois`;
  return `${(jours / 365.25).toFixed(1).replace(".", ",")} ans`;
}

export { Rating, State };
