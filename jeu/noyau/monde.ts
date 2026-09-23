import type { Carte } from "./carte";
import { resoudreTouches } from "./combat";
import { avancerCombattant, creerCombattant, type Combattant } from "./combattant";
import { avancerFrame } from "./coups";
import type { PersoDef } from "./definitions";
import type { Entree } from "./entrees";
import { avancerEntites, nettoyerEntites, type Entite } from "./entites";
import type { Evenement } from "./evenements";
import {
  DUREE_RALENTI, REGLAGES_STANDARD, avancerPhase, placerCombattants, verifierChutes, type Reglages,
} from "./regles";

/*
 * Le monde : tout l'état d'une partie à un tick donné.
 *
 * `avancerMonde` est la boucle de simulation : un appel = un tick de
 * 1/60 s, et toujours le même résultat pour les mêmes entrées. Le rythme
 * réel (image du navigateur, minuterie du serveur) est géré au-dehors,
 * cf. horloge.ts.
 */

export type Phase = "decompte" | "combat" | "finManche" | "finPartie";

export type Monde = {
  tick: number;
  carte: Carte;
  reglages: Reglages;
  phase: Phase;
  /** Ticks écoulés depuis le début de la phase. */
  phaseTicks: number;
  manche: number;
  /** Ticks restants dans la manche (si elle est chronométrée). */
  chrono: number;
  /** Place du vainqueur de la dernière manche, -1 pour un nul. */
  vainqueurManche: number;
  /** En fin de partie : place du vainqueur, -1 pour une égalité. */
  vainqueur: number;
  combattants: Combattant[];
  /** Projectiles, zones, pièges… en jeu. */
  entites: Entite[];
  /** Identifiant de la prochaine entité créée. */
  prochaineEntite: number;
  /** Ce qui s'est passé pendant le dernier tick (effets visuels et sonores). */
  evenements: Evenement[];
};

export function creerMonde(carte: Carte, persos: readonly PersoDef[], reglages: Reglages = REGLAGES_STANDARD): Monde {
  if (persos.length > carte.apparitions.length) {
    throw new Error(`carte prévue pour ${carte.apparitions.length} combattants, ${persos.length} demandés`);
  }
  const monde: Monde = {
    tick: 0,
    carte,
    reglages,
    phase: reglages.dureeDecompte > 0 ? "decompte" : "combat",
    phaseTicks: 0,
    manche: 1,
    chrono: reglages.dureeManche,
    vainqueurManche: -1,
    vainqueur: -1,
    combattants: persos.map((p, i) => creerCombattant(p, i, 0, 0)),
    entites: [],
    prochaineEntite: 1,
    evenements: [],
  };
  placerCombattants(monde);
  return monde;
}

/** Un tick. `entrees[i]` est l'entrée du combattant i (aucune si absente). */
export function avancerMonde(monde: Monde, entrees: readonly Entree[]): void {
  monde.tick++;
  monde.evenements = [];
  const ralenti = monde.phase === "finManche" && monde.phaseTicks < DUREE_RALENTI && monde.phaseTicks % 3 !== 0;
  if (!ralenti) {
    for (const c of monde.combattants) avancerCombattant(c, entrees[c.id] ?? 0, monde);
    avancerEntites(monde);
    resoudreTouches(monde);
    verifierChutes(monde);
    for (const c of monde.combattants) avancerFrame(c, monde);
    nettoyerEntites(monde);
  }
  avancerPhase(monde);
}

/**
 * Empreinte (FNV-1a) de tout l'état. Mêmes entrées ⇒ même empreinte :
 * c'est ce qui permet de vérifier le déterminisme et, plus tard, de
 * repérer une divergence entre un client et le serveur.
 */
export function empreinteMonde(monde: Monde): number {
  const texte = JSON.stringify(monde, (cle, v) =>
    cle === "carte" || cle === "perso" ? v.id : cle === "evenements" ? undefined : v);
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) h = Math.imul(h ^ texte.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
