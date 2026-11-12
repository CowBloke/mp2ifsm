/*
 * Curve Fight : ce que le serveur envoie à un navigateur. Chaque joueur
 * reçoit sa propre vue : sous le brouillard, ce qu'il n'a pas dégagé
 * n'est pas dans la réponse (rien à trouver dans les outils du navigateur).
 */
import type { Cercle, Reglages, StyleCarte } from "./monde";
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
  /** Courbes proposées par les éliminés (id : le conseiller), dévoilées avec les autres. */
  conseils: { id: string; cible: string; source: string; touches: { victime: string; tick: number }[] }[];
};

export type VueSalon = {
  v: number; code: string; phase: Phase; hote: string; moi: string;
  /** Horloge du serveur (ms) : le navigateur en déduit son décalage. */
  maintenant: number;
  reglages: Reglages;
  joueurs: VueJoueur[];
  manche: number; volee: number;
  /** Style de l'arène de la manche. */
  carte: StyleCarte;
  obstacles: Cercle[];
  crateres: (Cercle & { n: number })[];
  /** Fin de la préparation (ms), 0 : sans limite. */
  echeance: number;
  monExpression: string | null;
  /** Éliminé : le joueur que j'aide et ma proposition, que personne d'autre ne voit avant le départ. */
  monConseil: { cible: string; source: string | null } | null;
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
  /** Courbe fantôme : id du conseiller (la courbe part de `joueur`). */
  conseil?: string;
};

export type VueTraces = { n: number; traces: VueTrace[] };

export type SalonOuvert = {
  code: string; hote: string; joueurs: number; phase: Phase;
  mode: Reglages["mode"]; tir: Reglages["tir"];
};
