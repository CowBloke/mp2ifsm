import type { Point } from "../noyau/carte";
import type { Entree } from "../noyau/entrees";
import type { Evenement } from "../noyau/evenements";
import { creerHorloge, fractionTick, ticksAJouer } from "../noyau/horloge";
import { avancerMonde, type Monde } from "../noyau/monde";

/*
 * Partie jouée entièrement dans le navigateur (entraînement) : la
 * simulation du noyau tourne ici, au rythme de l'horloge à pas fixe.
 * Aucune dépendance au rendu : testable sans navigateur.
 */

/** Ce que le rendu affiche à une image donnée. */
export type VueJeu = {
  monde: Monde;
  /** Positions affichées (interpolées), par place. */
  positions: Point[];
  /** Événements survenus depuis l'image précédente. */
  evenements: Evenement[];
  /** Avancement dans le tick en cours (0 à 1), pour animer entre deux frames. */
  alpha: number;
  /** Place du joueur de cet écran, -1 pour un spectateur. */
  local: number;
};

/** Donne l'entrée d'un combattant non humain (bot, mannequin immobile…). */
export type Controleur = (monde: Monde, place: number) => Entree;

export type SessionLocale = {
  /**
   * Fait avancer la simulation du temps réel écoulé. L'entrée locale est
   * lue une fois par tick joué (et non par image : à 144 Hz, bien des
   * images ne jouent aucun tick, et un appui bref s'y perdrait).
   */
  avancer(ecouleMs: number, lireEntree: () => Entree): void;
  vue(): VueJeu;
  /** Monde courant, sans consommer les événements (outils de test). */
  monde(): Monde;
};

export function creerSessionLocale(
  creer: () => Monde,
  local: number,
  controleurs: readonly (Controleur | null)[] = [],
  /** Délai avant de relancer une partie terminée, en ticks. */
  relance = 300,
): SessionLocale {
  let monde = creer();
  const horloge = creerHorloge();
  let avant: Point[] = positions(monde);
  let evenements: Evenement[] = [];

  function positions(m: Monde): Point[] {
    return m.combattants.map((c) => ({ x: c.x, y: c.y }));
  }

  return {
    avancer(ecouleMs, lireEntree) {
      const ticks = ticksAJouer(horloge, ecouleMs);
      for (let i = 0; i < ticks; i++) {
        if (monde.phase === "finPartie" && monde.phaseTicks >= relance) monde = creer();
        avant = positions(monde);
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
        evenements,
        alpha,
        local,
      };
      evenements = [];
      return vue;
    },
  };
}
