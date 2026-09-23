import { creerBot } from "../noyau/bots/bot";
import { CARTES } from "../noyau/contenu";
import type { PersoDef } from "../noyau/definitions";
import { avancerMonde, creerMonde } from "../noyau/monde";
import { REGLAGES_STANDARD } from "../noyau/regles";
import { TICKS_PAR_SECONDE } from "../noyau/constantes";

/*
 * Arène d'équilibrage : chaque paire de personnages s'affronte, bots de
 * même niveau, places et cartes alternées. Entièrement déterministe
 * (graines fixes) : mêmes données, mêmes résultats. Les bots ne jouent
 * pas comme des humains — c'est un garde-fou (un personnage cassé saute
 * aux yeux), pas un verdict.
 */

export type Duel = { a: string; b: string; victoiresA: number; victoiresB: number; parties: number };

export type Tournoi = {
  duels: Duel[];
  /** Parties gagnées et jouées, par personnage. */
  victoires: Record<string, number>;
  jouees: Record<string, number>;
  dureeMoyenneS: number;
};

/** Au-delà, la partie est arrêtée (bots bloqués) et comptée nulle. */
const TICKS_MAX = 40_000;

export function tournoi(persos: readonly PersoDef[], { niveau, parties }: { niveau: number; parties: number }): Tournoi {
  const duels: Duel[] = [];
  const victoires: Record<string, number> = {};
  const jouees: Record<string, number> = {};
  let ticks = 0;
  for (let i = 0; i < persos.length; i++) {
    for (let j = i + 1; j < persos.length; j++) {
      const duel: Duel = { a: persos[i].id, b: persos[j].id, victoiresA: 0, victoiresB: 0, parties };
      for (let k = 0; k < parties; k++) {
        const inverse = k % 2 === 1;
        const m = creerMonde(CARTES[k % CARTES.length], inverse ? [persos[j], persos[i]] : [persos[i], persos[j]], REGLAGES_STANDARD);
        const bots = [creerBot(niveau, 1000 + k * 13 + i * 7), creerBot(niveau, 2000 + k * 17 + j * 5)];
        while (m.phase !== "finPartie" && m.tick < TICKS_MAX) avancerMonde(m, m.combattants.map((c) => bots[c.id](m, c.id)));
        ticks += m.tick;
        if (m.vainqueur === (inverse ? 1 : 0)) duel.victoiresA++;
        else if (m.vainqueur === (inverse ? 0 : 1)) duel.victoiresB++;
      }
      duels.push(duel);
      victoires[duel.a] = (victoires[duel.a] ?? 0) + duel.victoiresA;
      victoires[duel.b] = (victoires[duel.b] ?? 0) + duel.victoiresB;
      jouees[duel.a] = (jouees[duel.a] ?? 0) + parties;
      jouees[duel.b] = (jouees[duel.b] ?? 0) + parties;
    }
  }
  const total = duels.reduce((s, d) => s + d.parties, 0);
  return { duels, victoires, jouees, dureeMoyenneS: total ? ticks / total / TICKS_PAR_SECONDE : 0 };
}
