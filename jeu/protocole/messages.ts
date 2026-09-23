import type { Entree } from "../noyau/entrees";
import type { Reglages } from "../noyau/regles";
import { Ecrivain, Lecteur } from "./binaire";
import { ecrireInstantane, lireInstantane, type Instantane } from "./etat";
import type { Carte } from "../noyau/carte";

/*
 * Protocole entre le navigateur et le serveur de jeu.
 *
 * Contrôle (salons, choix) : JSON, rare. Temps réel : binaire, le
 * premier octet donne le type. Un client n'envoie JAMAIS que ses
 * entrées : ni position, ni dégâts, ni résultat.
 */

/** Change à chaque évolution incompatible ; un client périmé est invité à recharger. */
export const VERSION_PROTOCOLE = 3;

export const CHEMIN_WS = "/ws/jeu";

// --- Messages de contrôle (JSON) ---------------------------------------

export type PlaceVue = {
  /** Compte du joueur ; null pour un bot. */
  uid: string | null;
  nom: string;
  perso: string;
  pret: boolean;
  connecte: boolean;
  /** Niveau du bot (null : humain). */
  bot: number | null;
  /** Joueur déconnecté en partie, remplacé par un bot jusqu'à son retour. */
  releve: boolean;
};

export type EtatSalon = {
  code: string;
  hote: string;
  etat: "attente" | "partie";
  carte: string;
  places: (PlaceVue | null)[];
  spectateurs: number;
};

export type DebutPartie = {
  code: string;
  carte: string;
  reglages: Reglages;
  noms: string[];
  /** Place du destinataire, -1 pour un spectateur. */
  place: number;
};

export type MessageClient =
  /** `contenu` : empreinte des données du jeu (noyau/contenu/empreinte.ts). */
  | { t: "bonjour"; v: number; contenu: string; ticket: string }
  | { t: "creer" }
  | { t: "rejoindre"; code: string }
  | { t: "regarder"; code: string }
  | { t: "quitter" }
  | { t: "perso"; id: string }
  | { t: "pret"; pret: boolean }
  | { t: "carte"; id: string }
  | { t: "bot"; place: number; niveau: number | null }
  | { t: "persoBot"; place: number; id: string }
  | { t: "exclure"; place: number }
  | { t: "lancer" };

export type MessageServeur =
  | { t: "bienvenue"; uid: string; nom: string }
  | { t: "refus"; raison: string }
  | { t: "erreur"; message: string }
  | { t: "salon"; salon: EtatSalon }
  | { t: "debut"; partie: DebutPartie }
  | { t: "sorti" };

// --- Temps réel (binaire) ----------------------------------------------

export const B_ENTREE = 1;
export const B_PING = 2;
export const B_PONG = 3;
export const B_ETAT = 10;

const ecrivain = new Ecrivain();

/** Entrée d'un tick : numéro de séquence et champ de bits. */
export function coderEntree(seq: number, entree: Entree): Uint8Array {
  return ecrivain.vider().octet(B_ENTREE).naturel(seq).naturel(entree).resultat();
}

export function coderPing(b: typeof B_PING | typeof B_PONG, horodatage: number): Uint8Array {
  return ecrivain.vider().octet(b).naturel(horodatage).resultat();
}

export function coderInstantane(i: Instantane): Uint8Array {
  ecrivain.vider().octet(B_ETAT);
  ecrireInstantane(ecrivain, i);
  return ecrivain.resultat();
}

export type MessageBinaire =
  | { b: typeof B_ENTREE; seq: number; entree: Entree }
  | { b: typeof B_PING | typeof B_PONG; horodatage: number }
  | { b: typeof B_ETAT; lecteur: Lecteur };

/** Premier niveau du décodage ; l'état se lit ensuite avec `lireEtat` (il faut la carte). */
export function decoderBinaire(octets: Uint8Array): MessageBinaire {
  const l = new Lecteur(octets);
  const b = l.octet();
  if (b === B_ENTREE) return { b, seq: l.naturel(), entree: l.naturel() };
  if (b === B_PING || b === B_PONG) return { b, horodatage: l.naturel() };
  if (b === B_ETAT) return { b, lecteur: l };
  throw new RangeError(`message binaire inconnu : ${b}`);
}

export function lireEtat(l: Lecteur, contexte: { carte: Carte; reglages: Reglages }): Instantane {
  return lireInstantane(l, contexte);
}
