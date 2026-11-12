/*
 * Curve Fight : le temps d'une volée à l'écran. Module pur, partagé :
 * le serveur s'en sert pour savoir quand la volée finit, chaque
 * navigateur pour savoir où en sont les courbes. Les deux partent des
 * mêmes données (nombre de ticks, éliminations, joueurs en lice), donc
 * tout le monde voit le même ralenti au même instant.
 *
 * - Ralenti autour de chaque élimination, plus fort pour un coup double,
 *   le coup qui finit la manche ou un tir ami ; un arrêt sur image au
 *   moment du contact.
 * - Accéléré quand plus rien ne peut arriver : après la dernière
 *   élimination (ou d'emblée s'il n'y en a aucune), les courbes filent.
 */
import { PAS, VITESSE } from "./monde";

/** Durée d'un tick à vitesse normale (ms). */
export const MS_TICK = (PAS / VITESSE) * 1000;
/** Facteur de vitesse quand plus rien n'arrive. */
export const ACCELERE = 2.6;

export type Elimination = { tick: number; tueur: string; victime: string };

export type Moment = {
  tick: number;
  /** 1 : une élimination ; 2 : coup double ou tir ami ; 3 : le coup qui finit la manche. */
  force: 1 | 2 | 3;
  victimes: string[];
  tirAmi: boolean;
  /** Après ce moment, il reste au plus un joueur. */
  decisif: boolean;
};

export type Chronologie = {
  ticks: number;
  /** debuts[i] : instant (ms après le départ) où l'animation atteint le tick i ; une case de plus pour la fin. */
  debuts: Float64Array;
  /** pauses[i] : arrêt sur image au début du tick i (ms, comprises dans debuts). */
  pauses: Float64Array;
  duree: number;
  moments: Moment[];
  /** Tick à partir duquel l'accéléré est complet. */
  acceleration: number;
};

/** Ralenti : vitesse au plus bas, ticks d'approche, de maintien, de reprise, arrêt sur image (ms). */
const PROFILS = {
  1: { lent: 0.34, approche: 18, maintien: 8, reprise: 22, arret: 110 },
  2: { lent: 0.2, approche: 26, maintien: 14, reprise: 26, arret: 200 },
  3: { lent: 0.12, approche: 36, maintien: 22, reprise: 30, arret: 320 },
} as const;
/** Éliminations à moins de tant de ticks l'une de l'autre : un seul moment. */
const GROUPE = 4;
const ELAN = 30;

const lisse = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** Regroupe les éliminations d'une volée en moments, et dit lesquels sont épiques. */
export function moments(eliminations: Elimination[], enLice: number): Moment[] {
  const triees = [...eliminations].sort((a, b) => a.tick - b.tick);
  const liste: Moment[] = [];
  let vivants = enLice;
  for (let i = 0; i < triees.length;) {
    const groupe = [triees[i]];
    while (i + groupe.length < triees.length && triees[i + groupe.length].tick - groupe[groupe.length - 1].tick <= GROUPE) {
      groupe.push(triees[i + groupe.length]);
    }
    i += groupe.length;
    vivants -= groupe.length;
    const tirAmi = groupe.some((e) => e.tueur === e.victime);
    const decisif = vivants <= 1;
    const force = decisif ? 3 : groupe.length >= 2 || tirAmi ? 2 : 1;
    liste.push({ tick: groupe[0].tick, force, victimes: groupe.map((e) => e.victime), tirAmi, decisif });
  }
  return liste;
}

/** Poids du ralenti d'un moment au tick donné (0 : aucun, 1 : au plus fort). */
function poids(m: Moment, tick: number): number {
  const p = PROFILS[m.force];
  const d = tick - m.tick;
  if (d < -p.approche || d > p.maintien + p.reprise) return 0;
  if (d < 0) return lisse((d + p.approche) / p.approche);
  if (d <= p.maintien) return 1;
  return 1 - lisse((d - p.maintien) / p.reprise);
}

/** Le moment qui pèse le plus au tick donné, et son poids. */
export function momentEnCours(c: Chronologie, tick: number): { moment: Moment; poids: number } | null {
  let meilleur: { moment: Moment; poids: number } | null = null;
  for (const m of c.moments) {
    const w = poids(m, tick);
    if (w > 0 && (!meilleur || w * m.force > meilleur.poids * meilleur.moment.force)) meilleur = { moment: m, poids: w };
  }
  return meilleur;
}

/** Vitesse de l'animation au tick donné (1 : normale). */
export function vitesse(c: Pick<Chronologie, "moments" | "acceleration">, tick: number): number {
  let v = 1;
  for (const m of c.moments) {
    const w = poids(m, tick);
    if (w > 0) v = Math.min(v, 1 - (1 - PROFILS[m.force].lent) * w);
  }
  if (v < 1) return v;
  return 1 + (ACCELERE - 1) * lisse(1 - (c.acceleration - tick) / ELAN);
}

export function chronologie(ticks: number, eliminations: Elimination[], enLice: number): Chronologie {
  const ms = moments(eliminations, enLice);
  const dernier = ms.length ? ms[ms.length - 1] : null;
  // Plus rien ne peut arriver après la fin du ralenti du dernier moment.
  const calme = dernier ? dernier.tick + PROFILS[dernier.force].maintien + PROFILS[dernier.force].reprise : 24;
  const acceleration = calme + ELAN;
  const n = Math.max(0, Math.ceil(ticks));
  const debuts = new Float64Array(n + 1);
  const pauses = new Float64Array(n + 1);
  for (const m of ms) if (m.tick <= n) pauses[m.tick] += PROFILS[m.force].arret;
  const c = { moments: ms, acceleration };
  for (let i = 0; i < n; i++) debuts[i + 1] = debuts[i] + pauses[i] + MS_TICK / vitesse(c, i + 0.5);
  return { ticks: n, debuts, pauses, duree: debuts[n] + pauses[n], moments: ms, acceleration };
}

/** Tick (fractionnaire) atteint `ms` millisecondes après le départ. */
export function tickA(c: Chronologie, ms: number): number {
  if (ms <= 0) return 0;
  if (ms >= c.debuts[c.ticks]) {
    const apres = ms - c.debuts[c.ticks] - c.pauses[c.ticks];
    return c.ticks + Math.max(0, apres) / MS_TICK;
  }
  let a = 0, b = c.ticks;
  while (b - a > 1) {
    const m = (a + b) >> 1;
    if (c.debuts[m] <= ms) a = m; else b = m;
  }
  const debut = c.debuts[a] + c.pauses[a];
  if (ms <= debut) return a;
  return a + (ms - debut) / (c.debuts[a + 1] - debut);
}

/** La chronologie d'une volée telle que le navigateur la reçoit. */
export function chronologieDe(tir: {
  ticks: number; vivantsAvant: string[];
  evenements: ({ type: "elimination"; tick: number; tueur: string; victime: string } | { type: "impact" })[];
}): Chronologie {
  const elims = tir.evenements.flatMap((e) => (e.type === "elimination" ? [{ tick: e.tick, tueur: e.tueur, victime: e.victime }] : []));
  return chronologie(tir.ticks, elims, tir.vivantsAvant.length);
}
