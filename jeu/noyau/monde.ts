import type { Carte } from "./carte";
import {
  avancerCombattant, creerCombattant, type Combattant, type StatsCombattant,
} from "./combattant";
import type { Entree } from "./entrees";

/*
 * Le monde : tout l'état d'une partie à un tick donné.
 *
 * `avancerMonde` est la boucle de simulation : un appel = un tick de
 * 1/60 s, et toujours le même résultat pour les mêmes entrées. Le rythme
 * réel (image du navigateur, minuterie du serveur) est géré au-dehors,
 * cf. horloge.ts.
 */

export type Monde = {
  tick: number;
  carte: Carte;
  combattants: Combattant[];
};

export function creerMonde(carte: Carte, stats: readonly StatsCombattant[]): Monde {
  if (stats.length > carte.apparitions.length) {
    throw new Error(`carte prévue pour ${carte.apparitions.length} combattants, ${stats.length} demandés`);
  }
  return {
    tick: 0,
    carte,
    combattants: stats.map((s, i) => creerCombattant(s, carte.apparitions[i].x, carte.apparitions[i].y)),
  };
}

/** Un tick. `entrees[i]` est l'entrée du combattant i (aucune si absente). */
export function avancerMonde(monde: Monde, entrees: readonly Entree[]): void {
  for (let i = 0; i < monde.combattants.length; i++) {
    avancerCombattant(monde.combattants[i], entrees[i] ?? 0, monde.carte);
  }
  monde.tick++;
}

/**
 * Empreinte (façon FNV-1a, sur des entiers 32 bits) de tout l'état
 * variable. Mêmes entrées ⇒ même empreinte : c'est ce qui permettra de
 * repérer une divergence entre la prédiction d'un client et le serveur.
 */
export function empreinteMonde(monde: Monde): number {
  let h = 0x811c9dc5;
  const melanger = (v: number) => {
    h = Math.imul(h ^ (v | 0), 0x01000193);
  };
  melanger(monde.tick);
  for (const c of monde.combattants) {
    melanger(c.x); melanger(c.y); melanger(c.vx); melanger(c.vy);
    melanger(c.orientation); melanger(c.auSol ? 1 : 0);
    melanger(c.sautsRestants); melanger(c.dashsRestants);
    melanger(c.dash); melanger(c.recharge); melanger(c.entreePrecedente);
  }
  return h >>> 0;
}
