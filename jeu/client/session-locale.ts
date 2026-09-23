import type { Point } from "../noyau/carte";
import type { Entree } from "../noyau/entrees";
import type { Evenement } from "../noyau/evenements";
import type { Controleur } from "../noyau/bots/bot";
import type { SessionJeu, VueJeu } from "./session";
import { creerHorloge, fractionTick, ticksAJouer } from "../noyau/horloge";
import { avancerMonde, type Monde } from "../noyau/monde";

/*
 * Partie jouée entièrement dans le navigateur (entraînement) : la
 * simulation du noyau tourne ici, au rythme de l'horloge à pas fixe.
 * Aucune dépendance au rendu : testable sans navigateur.
 */


export type { VueJeu } from "./session";

export function creerSessionLocale(
  creer: () => Monde,
  local: number,
  /** Contrôleurs des autres places (bots), recréés à chaque nouvelle partie. */
  creerControleurs: () => readonly (Controleur | null)[] = () => [],
  /** Délai avant de relancer une partie terminée, en ticks. */
  relance = 300,
): SessionJeu {
  let monde = creer();
  let controleurs = creerControleurs();
  const horloge = creerHorloge();
  let avant: Point[] = positions(monde);
  let avantEntites = new Map<number, Point>();
  let evenements: Evenement[] = [];

  function positions(m: Monde): Point[] {
    return m.combattants.map((c) => ({ x: c.x, y: c.y }));
  }

  return {
    avancer(ecouleMs, lireEntree) {
      const ticks = ticksAJouer(horloge, ecouleMs);
      for (let i = 0; i < ticks; i++) {
        if (monde.phase === "finPartie" && monde.phaseTicks >= relance) {
          monde = creer();
          controleurs = creerControleurs();
        }
        avant = positions(monde);
        avantEntites = new Map(monde.entites.map((e) => [e.id, { x: e.x, y: e.y }]));
        const entreeLocale = lireEntree();
        const entrees = monde.combattants.map((c) =>
          c.id === local ? entreeLocale : controleurs[c.id]?.(monde, c.id) ?? 0);
        avancerMonde(monde, entrees);
        evenements.push(...monde.evenements);
      }
    },

    monde() {
      return monde;
    },

    recommencer() {
      monde = creer();
      controleurs = creerControleurs();
      avant = positions(monde);
      avantEntites = new Map();
      evenements = [];
    },

    vue() {
      const alpha = fractionTick(horloge);
      const vue: VueJeu = {
        monde,
        positions: monde.combattants.map((c, i) => {
          const a = avant[i] ?? c;
          // Réapparition : pas d'interpolation à travers l'arène.
          if (Math.abs(c.x - a.x) > 50_000 || Math.abs(c.y - a.y) > 50_000) return { x: c.x, y: c.y };
          return { x: a.x + (c.x - a.x) * alpha, y: a.y + (c.y - a.y) * alpha };
        }),
        positionsEntites: new Map(monde.entites.map((e) => {
          const a = avantEntites.get(e.id) ?? e;
          return [e.id, { x: a.x + (e.x - a.x) * alpha, y: a.y + (e.y - a.y) * alpha }];
        })),
        evenements,
        alpha,
        local,
      };
      evenements = [];
      return vue;
    },
  };
}
