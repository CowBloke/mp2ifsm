import { carteParId, persoParId } from "../noyau/contenu";
import { ACTIONS, TOUTES, type Entree } from "../noyau/entrees";
import { avancerMonde, creerMonde, type Monde } from "../noyau/monde";
import type { Reglages } from "../noyau/regles";
import type { EvenementDate } from "../protocole/etat";
import { coderInstantane } from "../protocole/messages";

/*
 * Une partie côté serveur : le monde qui fait foi, et une file d'entrées
 * par joueur.
 *
 * Chaque tick consomme au plus une entrée par joueur. Si rien n'est
 * arrivé (gigue réseau), la dernière entrée est répétée : les touches
 * tenues le restent, sans créer de nouvel appui. Si la file s'allonge
 * (rafale après un ralentissement), les entrées en trop sont fusionnées
 * en gardant leurs appuis : la latence ajoutée ne dépasse jamais deux
 * ticks.
 */

/** Au-delà, les entrées les plus anciennes sont fusionnées dans les suivantes. */
const FILE_CIBLE = 2;

/** Donne l'entrée d'un combattant sans joueur connecté (bot, mannequin…). */
export type Controleur = (monde: Monde, place: number) => Entree;

type Joueur = {
  file: { seq: number; entree: Entree }[];
  derniere: Entree;
  /** Numéro de la dernière entrée consommée. */
  ack: number;
  /** Contrôle par programme (bot, relève d'un joueur déconnecté). */
  controleur: Controleur | null;
};

export class PartieServeur {
  readonly monde: Monde;
  private readonly joueurs: Joueur[];
  private evenements: EvenementDate[] = [];

  constructor(carte: string, persos: readonly string[], reglages: Reglages, readonly instantaneTous = 2) {
    this.monde = creerMonde(carteParId(carte), persos.map(persoParId), reglages);
    this.joueurs = persos.map(() => ({ file: [], derniere: 0, ack: 0, controleur: null }));
  }

  recevoirEntree(place: number, seq: number, entree: Entree): void {
    const j = this.joueurs[place];
    if (!j || !Number.isSafeInteger(seq)) return;
    const derniere = j.file.length > 0 ? j.file[j.file.length - 1].seq : j.ack;
    if (seq <= derniere) return; // doublon ou entrée périmée
    j.file.push({ seq, entree: entree & TOUTES });
  }

  /** Joueur parti : plus aucune touche tenue, plus rien en attente. */
  relacher(place: number): void {
    const j = this.joueurs[place];
    if (!j) return;
    j.file = [];
    j.derniere = 0;
  }

  /**
   * Un joueur reprend sa place (reconnexion, page rechargée) : sa
   * numérotation d'entrées repart peut-être de zéro, on oublie l'ancienne.
   */
  reprendre(place: number): void {
    const j = this.joueurs[place];
    if (!j) return;
    j.file = [];
    j.derniere = 0;
    j.ack = 0;
    j.controleur = null;
  }

  controler(place: number, controleur: Controleur | null): void {
    const j = this.joueurs[place];
    if (j) j.controleur = controleur;
  }

  /** Un tick. Renvoie l'instantané à diffuser quand c'est son tour, sinon null. */
  avancer(): Uint8Array | null {
    const entrees = this.joueurs.map((j, place) => {
      if (j.controleur) return j.controleur(this.monde, place);
      while (j.file.length > FILE_CIBLE) {
        const vieille = j.file.shift()!;
        j.file[0].entree |= vieille.entree & ACTIONS;
      }
      const suivante = j.file.shift();
      if (suivante) {
        j.derniere = suivante.entree;
        j.ack = suivante.seq;
      }
      return j.derniere;
    });
    avancerMonde(this.monde, entrees);
    for (const evenement of this.monde.evenements) this.evenements.push({ tick: this.monde.tick, evenement });
    if (this.monde.tick % this.instantaneTous !== 0) return null;
    return this.instantane();
  }

  /** Instantané complet (arrivée d'un spectateur, reconnexion) ; vide les événements en attente. */
  instantane(): Uint8Array {
    const octets = coderInstantane({ monde: this.monde, acks: this.joueurs.map((j) => j.ack), evenements: this.evenements });
    this.evenements = [];
    return octets;
  }
}
