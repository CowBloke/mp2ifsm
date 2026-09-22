import { boiteDe, replacer } from "./combattant";
import { horsDe } from "./collisions";
import { emettre } from "./evenements";
import type { Monde, Phase } from "./monde";

/*
 * Règles d'une partie : manches, chrono, chutes, vainqueur.
 */

export type Reglages = {
  /** Manches à gagner pour remporter la partie. */
  manchesGagnantes: number;
  /** Au-delà, la partie s'arrête : plus de victoires, puis plus de dégâts infligés. */
  manchesMax: number;
  /** Durée d'une manche en ticks ; 0 = illimitée. */
  dureeManche: number;
  dureeDecompte: number;
  /** PV perdus en sortant de l'arène, en ‰ des PV max. */
  penaliteChute: number;
  /** La jauge d'ultime passe-t-elle d'une manche à l'autre ? */
  jaugeConservee: boolean;
};

export const REGLAGES_STANDARD: Reglages = {
  manchesGagnantes: 2,
  manchesMax: 3,
  dureeManche: 75 * 60,
  dureeDecompte: 150,
  penaliteChute: 250,
  jaugeConservee: true,
};

export const DUREE_FIN_MANCHE = 180;
/** Au début de la fin de manche, la simulation tourne au tiers de sa vitesse. */
export const DUREE_RALENTI = 60;
export const INVULNERABILITE_REAPPARITION = 90;

function changerPhase(monde: Monde, phase: Phase): void {
  monde.phase = phase;
  monde.phaseTicks = 0;
  emettre(monde, { type: "phase", cle: phase, valeur: monde.manche });
}

/** Tout le monde à son point d'apparition, face au centre de l'arène. */
export function placerCombattants(monde: Monde): void {
  const { apparitions, limites } = monde.carte;
  const centre = (limites.gauche + limites.droite) / 2;
  for (const c of monde.combattants) {
    const p = apparitions[c.id % apparitions.length];
    replacer(c, p.x, p.y, p.x <= centre ? 1 : -1);
  }
}

/** Manche suivante : positions, PV et effets remis à zéro. */
function nouvelleManche(monde: Monde): void {
  monde.manche++;
  monde.chrono = monde.reglages.dureeManche;
  monde.vainqueurManche = -1;
  placerCombattants(monde);
  if (!monde.reglages.jaugeConservee) for (const c of monde.combattants) c.jauge = 0;
  changerPhase(monde, monde.reglages.dureeDecompte > 0 ? "decompte" : "combat");
}

/**
 * Sortie de la zone de vie : un combattant K.O. disparaît ; les autres
 * perdent une part de leurs PV et réapparaissent, invulnérables un instant.
 */
export function verifierChutes(monde: Monde): void {
  for (const c of monde.combattants) {
    if (c.horsJeu || !horsDe(boiteDe(c), monde.carte.zoneVie)) continue;
    if (c.ko) {
      c.horsJeu = true;
      continue;
    }
    const perte = Math.trunc((c.perso.stats.pv * monde.reglages.penaliteChute) / 1000);
    c.pv = Math.max(0, c.pv - perte);
    emettre(monde, { type: "chute", cible: c.id, x: c.x, y: c.y, valeur: perte });
    if (c.pv === 0) {
      c.ko = true;
      c.horsJeu = true;
      emettre(monde, { type: "ko", cible: c.id, x: c.x, y: c.y });
      continue;
    }
    const { apparitions, limites } = monde.carte;
    const p = apparitions[c.id % apparitions.length];
    const { pv, jauge } = c;
    replacer(c, p.x, p.y, p.x <= (limites.gauche + limites.droite) / 2 ? 1 : -1);
    c.pv = pv;
    c.jauge = jauge;
    c.invulnerable = INVULNERABILITE_REAPPARITION;
  }
}

/** Fin de manche : dernier debout, ou meilleure part de PV au chrono. */
function terminerManche(monde: Monde): void {
  const vivants = monde.combattants.filter((c) => !c.ko);
  let gagnant = -1;
  if (vivants.length === 1) {
    gagnant = vivants[0].id;
  } else if (vivants.length > 1) {
    const part = (c: (typeof vivants)[number]) => Math.trunc((c.pv * 1000) / c.perso.stats.pv);
    const meilleure = Math.max(...vivants.map(part));
    const premiers = vivants.filter((c) => part(c) === meilleure);
    if (premiers.length === 1) gagnant = premiers[0].id;
  }
  monde.vainqueurManche = gagnant;
  if (gagnant >= 0) monde.combattants[gagnant].victoires++;
  changerPhase(monde, "finManche");
}

/** Vainqueur de la partie : plus de manches gagnées, puis plus de dégâts ; -1 si égalité parfaite. */
function vainqueurPartie(monde: Monde): number {
  const tri = [...monde.combattants].sort(
    (a, b) => b.victoires - a.victoires || b.degatsInfliges - a.degatsInfliges,
  );
  const [premier, second] = tri;
  if (second && premier.victoires === second.victoires && premier.degatsInfliges === second.degatsInfliges) return -1;
  return premier.id;
}

export function avancerPhase(monde: Monde): void {
  const r = monde.reglages;
  monde.phaseTicks++;
  switch (monde.phase) {
    case "decompte":
      if (monde.phaseTicks >= r.dureeDecompte) changerPhase(monde, "combat");
      break;
    case "combat": {
      if (r.dureeManche > 0 && monde.chrono > 0) monde.chrono--;
      const debout = monde.combattants.filter((c) => !c.ko).length;
      const plusQuUn = monde.combattants.length >= 2 && debout <= 1;
      if (plusQuUn || (r.dureeManche > 0 && monde.chrono === 0)) terminerManche(monde);
      break;
    }
    case "finManche":
      if (monde.phaseTicks >= DUREE_FIN_MANCHE) {
        const gagnee = monde.combattants.some((c) => c.victoires >= r.manchesGagnantes);
        if (gagnee || monde.manche >= r.manchesMax) {
          monde.vainqueur = vainqueurPartie(monde);
          changerPhase(monde, "finPartie");
        } else {
          nouvelleManche(monde);
        }
      }
      break;
    case "finPartie":
      break;
  }
}
