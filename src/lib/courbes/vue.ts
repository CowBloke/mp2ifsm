/*
 * Curve Fight : ce que le serveur envoie à un navigateur. Chaque joueur
 * reçoit sa propre vue : sous le brouillard, ce qu'il n'a pas dégagé
 * n'est pas dans la réponse (rien à trouver dans les outils du navigateur).
 */
import type { Cercle, Reglages } from "./monde";
import type { Fin } from "./simulation";

export type Phase = "salon" | "preparation" | "volee" | "finManche" | "fin";

export type VueJoueur = {
  id: string; nom: string; couleur: number; bot: boolean;
  enJeu: boolean; vivant: boolean; pret: boolean; present: boolean;
  points: number; eliminations: number; manchesGagnees: number;
  /** null : caché par le brouillard. */
  x: number | null; y: number | null;
};

export type VueEvenement =
  | { tick: number; type: "elimination"; tueur: string; victime: string; x: number | null; y: number | null }
  | { tick: number; type: "impact"; joueur: string; x: number; y: number };

export type VueTir = {
  /** Numéro unique de la volée dans le salon : clé des traces à télécharger. */
  n: number;
  manche: number; volee: number;
  tRevelation: number; tAnimation: number; tFin: number;
  ticks: number;
  /** source null : n'a pas tiré. */
  expressions: { id: string; source: string | null }[];
  evenements: VueEvenement[];
  /** Les cratères de rang ≥ crateresAvant apparaissent pendant cette volée. */
  crateresAvant: number;
  vivantsAvant: string[];
};

export type VueSalon = {
  v: number; code: string; phase: Phase; hote: string; moi: string;
  /** Horloge du serveur (ms) : le navigateur en déduit son décalage. */
  maintenant: number;
  reglages: Reglages;
  joueurs: VueJoueur[];
  manche: number; volee: number;
  obstacles: Cercle[];
  crateres: (Cercle & { n: number })[];
  /** Fin de la préparation (ms), 0 : sans limite. */
  echeance: number;
  monExpression: string | null;
  historique: { volee: number; source: string; bilan: string }[];
  /** Non nul : je suis sous le brouillard ; mes couloirs déjà dégagés. */
  voile: { sillages: number[][] } | null;
  tir: VueTir | null;
  /** Fin de l'écran de manche (ms). */
  transition: number;
  gagnants: string[];
};

export type VueTrace = {
  joueur: string; dir: 1 | -1;
  /** Tick du premier point (une courbe adverse n'est connue que par morceaux). */
  debut: number;
  pts: number[];
  fin: Fin | null;
};

export type VueTraces = { n: number; traces: VueTrace[] };

export type SalonOuvert = {
  code: string; hote: string; joueurs: number; phase: Phase;
  mode: Reglages["mode"]; tir: Reglages["tir"];
};

/** Dix teintes lisibles sur fond sombre, dans l'ordre d'arrivée. */
export const COULEURS = [
  "#4fd8ff", "#ff5c7a", "#ffd23f", "#5dff9b", "#c38bff",
  "#ff9a3c", "#ff6bd6", "#9dff3c", "#7c9bff", "#f4f1e8",
];
