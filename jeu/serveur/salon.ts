import { CARTES, PERSOS } from "../noyau/contenu";
import { REGLAGES_STANDARD, type Reglages } from "../noyau/regles";
import type { DebutPartie, EtatSalon, MessageServeur } from "../protocole/messages";
import { PartieServeur, type Controleur } from "./partie";

/*
 * Un salon : jusqu'à quatre places (joueurs ou bots), des spectateurs,
 * un hôte qui règle et lance. En partie, les places sont figées : un
 * joueur qui se déconnecte garde la sienne et peut la reprendre.
 */

export const PLACES = 4;
/** Après la fin d'une partie, retour au salon au bout de ce nombre de ticks. */
const RETOUR_SALON = 360;

export type Connexion = {
  readonly id: number;
  uid: string | null;
  nom: string;
  role: "member" | "admin";
  salon: Salon | null;
  envoyer(m: MessageServeur): void;
  envoyerOctets(o: Uint8Array): void;
  fermer(code: number, raison: string): void;
};

export type Place = {
  uid: string | null;
  nom: string;
  perso: string;
  pret: boolean;
  connexion: Connexion | null;
  /** Niveau du bot ; null pour un humain. */
  bot: number | null;
};

export type OptionsSalon = {
  reglages?: Reglages;
  instantaneTous?: number;
  /** Fabrique le contrôleur d'un bot (ou d'un joueur absent) pour une place de la partie. */
  controleurBot?: (niveau: number, place: number, graine: number) => Controleur;
};

export class Salon {
  readonly places: (Place | null)[] = Array.from({ length: PLACES }, () => null);
  readonly spectateurs = new Set<Connexion>();
  etat: "attente" | "partie" = "attente";
  carte = CARTES[0].id;
  partie: PartieServeur | null = null;
  /** Pour chaque combattant de la partie, sa place dans le salon. */
  private placesPartie: number[] = [];
  derniereActivite = 0;

  constructor(readonly code: string, public hote: string, private readonly options: OptionsSalon = {}) {}

  vue(): EtatSalon {
    return {
      code: this.code,
      hote: this.hote,
      etat: this.etat,
      carte: this.carte,
      spectateurs: this.spectateurs.size,
      places: this.places.map((p) => p && {
        uid: p.uid, nom: p.nom, perso: p.perso, pret: p.pret, connecte: p.bot !== null || p.connexion !== null, bot: p.bot,
      }),
    };
  }

  private destinataires(): Connexion[] {
    const d: Connexion[] = [];
    for (const p of this.places) if (p?.connexion) d.push(p.connexion);
    return [...d, ...this.spectateurs];
  }

  diffuser(): void {
    const m: MessageServeur = { t: "salon", salon: this.vue() };
    for (const c of this.destinataires()) c.envoyer(m);
  }

  placeDe(uid: string | null): number {
    return uid === null ? -1 : this.places.findIndex((p) => p?.uid === uid);
  }

  /** Place du combattant de ce joueur dans la partie en cours, -1 sinon. */
  placePartie(c: Connexion): number {
    return this.placesPartie.indexOf(this.placeDe(c.uid));
  }

  vide(): boolean {
    return this.places.every((p) => !p || p.bot !== null || p.connexion === null) && this.spectateurs.size === 0;
  }

  /** Un joueur entre (ou revient). Renvoie un message d'erreur, ou null. */
  entrer(c: Connexion): string | null {
    this.spectateurs.delete(c);
    const deja = this.placeDe(c.uid);
    if (deja >= 0) {
      const p = this.places[deja]!;
      // Nouvelle connexion du même compte : l'ancienne est congédiée.
      if (p.connexion && p.connexion !== c) {
        p.connexion.salon = null;
        p.connexion.fermer(4001, "connecté ailleurs");
      }
      p.connexion = c;
      p.nom = c.nom;
      c.salon = this;
      const pp = this.placePartie(c);
      if (this.partie && pp >= 0) {
        this.partie.reprendre(pp);
        c.envoyer({ t: "debut", partie: this.debut(pp) });
        c.envoyerOctets(this.partie.instantane());
      }
      this.diffuser();
      return null;
    }
    if (this.etat === "partie") return "Partie en cours : entrez comme spectateur.";
    const libre = this.places.findIndex((p) => p === null);
    if (libre < 0) return "Salon complet.";
    this.places[libre] = { uid: c.uid, nom: c.nom, perso: PERSOS[0].id, pret: false, connexion: c, bot: null };
    c.salon = this;
    this.diffuser();
    return null;
  }

  regarder(c: Connexion): void {
    this.spectateurs.add(c);
    c.salon = this;
    c.envoyer({ t: "salon", salon: this.vue() });
    if (this.partie) {
      c.envoyer({ t: "debut", partie: this.debut(-1) });
      c.envoyerOctets(this.partie.instantane());
    }
    this.diffuser();
  }

  sortir(c: Connexion): void {
    c.salon = null;
    if (this.spectateurs.delete(c)) {
      this.diffuser();
      return;
    }
    const i = this.places.findIndex((p) => p?.connexion === c);
    if (i < 0) return;
    const pp = this.placesPartie.indexOf(i);
    if (this.partie && pp >= 0) {
      // En partie : la place reste ; le combattant ne fait plus rien.
      this.places[i]!.connexion = null;
      this.partie.relacher(pp);
    } else {
      this.places[i] = null;
    }
    if (c.uid === this.hote) this.changerHote();
    this.diffuser();
  }

  private changerHote(): void {
    const suivant = this.places.find((p) => p && p.bot === null && p.connexion);
    if (suivant?.uid) this.hote = suivant.uid;
  }

  private estHote(c: Connexion): boolean {
    return c.uid === this.hote;
  }

  choisirPerso(c: Connexion, id: string): string | null {
    const p = this.places[this.placeDe(c.uid)];
    if (!p || this.etat !== "attente") return "Impossible maintenant.";
    if (!PERSOS.some((x) => x.id === id)) return "Personnage inconnu.";
    p.perso = id;
    this.diffuser();
    return null;
  }

  pret(c: Connexion, pret: boolean): string | null {
    const p = this.places[this.placeDe(c.uid)];
    if (!p || this.etat !== "attente") return "Impossible maintenant.";
    p.pret = pret;
    this.diffuser();
    return null;
  }

  choisirCarte(c: Connexion, id: string): string | null {
    if (!this.estHote(c) || this.etat !== "attente") return "Seul l'hôte choisit la carte.";
    if (!CARTES.some((x) => x.id === id)) return "Carte inconnue.";
    this.carte = id;
    this.diffuser();
    return null;
  }

  /** Ajoute, règle ou retire un bot (niveau null) sur une place. */
  bot(c: Connexion, place: number, niveau: number | null): string | null {
    if (!this.estHote(c) || this.etat !== "attente") return "Seul l'hôte gère les bots.";
    const p = this.places[place];
    if (p && p.bot === null) return "Place occupée par un joueur.";
    this.places[place] = niveau === null ? null : {
      uid: null, nom: `Bot ${["facile", "moyen", "difficile", "expert"][niveau]}`, perso: p?.perso ?? PERSOS[place % PERSOS.length].id,
      pret: true, connexion: null, bot: niveau,
    };
    this.diffuser();
    return null;
  }

  /** Choisit le personnage d'un bot (hôte). */
  persoBot(c: Connexion, place: number, id: string): string | null {
    const p = this.places[place];
    if (!this.estHote(c) || !p || p.bot === null) return "Impossible.";
    if (!PERSOS.some((x) => x.id === id)) return "Personnage inconnu.";
    p.perso = id;
    this.diffuser();
    return null;
  }

  exclure(c: Connexion, place: number): string | null {
    const p = this.places[place];
    if (!this.estHote(c) || this.etat !== "attente" || !p || p.uid === this.hote) return "Impossible.";
    this.places[place] = null;
    if (p.connexion) {
      p.connexion.salon = null;
      p.connexion.envoyer({ t: "sorti" });
    }
    this.diffuser();
    return null;
  }

  lancer(c: Connexion, graine: number): string | null {
    if (!this.estHote(c) || this.etat !== "attente") return "Seul l'hôte lance la partie.";
    const occupees = this.places.map((p, i) => [p, i] as const).filter(([p]) => p !== null);
    if (occupees.length < 2) return "Il faut au moins deux combattants.";
    const pasPrets = occupees.filter(([p]) => p!.bot === null && p!.uid !== this.hote && !p!.pret);
    if (pasPrets.length > 0) return "Tout le monde n'est pas prêt.";

    this.placesPartie = occupees.map(([, i]) => i);
    this.partie = new PartieServeur(this.carte, occupees.map(([p]) => p!.perso), this.options.reglages ?? REGLAGES_STANDARD,
      this.options.instantaneTous ?? 2);
    occupees.forEach(([p], pp) => {
      if (p!.bot !== null && this.options.controleurBot) {
        this.partie!.controler(pp, this.options.controleurBot(p!.bot, pp, graine + pp));
      }
    });
    this.etat = "partie";
    for (const [p, i] of occupees) {
      p!.connexion?.envoyer({ t: "debut", partie: this.debut(this.placesPartie.indexOf(i)) });
    }
    for (const s of this.spectateurs) s.envoyer({ t: "debut", partie: this.debut(-1) });
    this.diffuser();
    return null;
  }

  private debut(place: number): DebutPartie {
    return {
      code: this.code,
      carte: this.partie!.monde.carte.id,
      reglages: this.partie!.monde.reglages,
      noms: this.placesPartie.map((i) => this.places[i]?.nom ?? "?"),
      place,
    };
  }

  /** Un tick de simulation ; diffuse l'instantané quand c'est son tour. */
  tick(): void {
    if (!this.partie) return;
    const octets = this.partie.avancer();
    if (octets) for (const c of this.destinataires()) c.envoyerOctets(octets);
    const m = this.partie.monde;
    if (m.phase === "finPartie" && m.phaseTicks >= RETOUR_SALON) this.terminer();
  }

  /** Fin de partie : retour au salon ; les joueurs absents libèrent leur place. */
  private terminer(): void {
    this.partie = null;
    this.placesPartie = [];
    this.etat = "attente";
    this.places.forEach((p, i) => {
      if (p && p.bot === null && !p.connexion) this.places[i] = null;
      else if (p && p.bot === null) p.pret = false;
    });
    if (this.placeDe(this.hote) < 0) this.changerHote();
    this.diffuser();
  }
}
