import type { Point } from "../noyau/carte";
import type { Entree } from "../noyau/entrees";
import type { Evenement } from "../noyau/evenements";
import type { Monde } from "../noyau/monde";

/*
 * Ce que le rendu attend d'une session, qu'elle soit locale
 * (entraînement) ou en réseau : avancer avec le temps réel, et fournir à
 * chaque image une vue du monde.
 */

/** Ce que le rendu affiche à une image donnée. */
export type VueJeu = {
  monde: Monde;
  /** Positions affichées (interpolées ou prédites), par place. */
  positions: Point[];
  /** Positions affichées des entités, par identifiant. */
  positionsEntites: ReadonlyMap<number, Point>;
  /** Événements survenus depuis l'image précédente. */
  evenements: Evenement[];
  /** Avancement dans le tick en cours (0 à 1), pour animer entre deux frames. */
  alpha: number;
  /** Place du joueur de cet écran, -1 pour un spectateur. */
  local: number;
};

export type SessionJeu = {
  /**
   * Fait avancer la session du temps réel écoulé. L'entrée locale est
   * lue une fois par tick joué (et non par image : à 144 Hz, bien des
   * images ne jouent aucun tick, et un appui bref s'y perdrait).
   */
  avancer(ecouleMs: number, lireEntree: () => Entree): void;
  vue(): VueJeu;
  /** Monde courant, sans consommer les événements (outils de test). */
  monde(): Monde;
  detruire?(): void;
  /** Partie locale : repart de zéro (nouvelle partie, mêmes réglages). */
  recommencer?(): void;
};
