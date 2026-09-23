import type { Entree } from "../noyau/entrees";
import { EMPREINTE_CONTENU } from "../noyau/contenu/empreinte";
import { VERSION_PROTOCOLE, type MessageClient } from "../protocole/messages";
import { verifierTicket } from "../protocole/ticket";
import { Salon, type Connexion, type OptionsSalon } from "./salon";

/*
 * Le hall : toutes les connexions et tous les salons du serveur. Il
 * authentifie (ticket), route les messages, et fait avancer chaque
 * partie à chaque tick.
 */

/** Sans ambiguïté à l'écrit ni à l'oral : ni I/1, ni O/0, ni L. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const SALONS_MAX = 60;
/** Un salon vide depuis ce délai (ms) disparaît. */
const DELAI_SALON_VIDE = 2 * 60 * 1000;

export type OptionsHall = OptionsSalon & {
  /** Secret de signature des tickets (SESSION_SECRET du site). */
  secret: string;
  maintenant?: () => number;
  /** Graine des bots d'une partie ; aléatoire par défaut. */
  graine?: () => number;
};

export class Hall {
  private readonly salons = new Map<string, Salon>();
  private readonly maintenant: () => number;

  constructor(private readonly options: OptionsHall) {
    this.maintenant = options.maintenant ?? Date.now;
  }

  get nombreSalons(): number {
    return this.salons.size;
  }

  get nombreParties(): number {
    let n = 0;
    for (const s of this.salons.values()) if (s.partie) n++;
    return n;
  }

  salon(code: string): Salon | undefined {
    return this.salons.get(code);
  }

  private nouveauCode(): string {
    for (;;) {
      let code = "";
      for (let i = 0; i < 4; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
      if (!this.salons.has(code)) return code;
    }
  }

  async recevoir(c: Connexion, m: MessageClient): Promise<void> {
    if (m.t === "bonjour") {
      // Autre version du jeu (protocole ou données) : ce navigateur a une page périmée.
      if (m.v !== VERSION_PROTOCOLE || m.contenu !== EMPREINTE_CONTENU) {
        c.envoyer({ t: "refus", raison: "Nouvelle version du jeu : rechargez la page." });
        c.fermer(4000, "version");
        return;
      }
      const ticket = await verifierTicket(m.ticket, this.options.secret, this.maintenant());
      if (!ticket) {
        c.envoyer({ t: "refus", raison: "Session expirée : rechargez la page." });
        c.fermer(4003, "ticket");
        return;
      }
      c.uid = ticket.uid;
      c.nom = ticket.nom;
      c.role = ticket.role;
      c.envoyer({ t: "bienvenue", uid: ticket.uid, nom: ticket.nom });
      return;
    }
    if (c.uid === null) {
      c.fermer(4003, "non authentifié");
      return;
    }

    const salon = c.salon;
    let erreur: string | null = null;
    switch (m.t) {
      case "creer": {
        if (this.salons.size >= SALONS_MAX) {
          erreur = "Trop de salons ouverts, réessayez plus tard.";
          break;
        }
        salon?.sortir(c);
        const s = new Salon(this.nouveauCode(), c.uid, this.options);
        s.derniereActivite = this.maintenant();
        this.salons.set(s.code, s);
        erreur = s.entrer(c);
        break;
      }
      case "rejoindre":
      case "regarder": {
        const s = this.salons.get(m.code);
        if (!s) {
          erreur = "Aucun salon avec ce code.";
          break;
        }
        if (salon && salon !== s) salon.sortir(c);
        if (salon === s && m.t === "regarder") break;
        s.derniereActivite = this.maintenant();
        if (m.t === "regarder") s.regarder(c);
        else erreur = s.entrer(c);
        break;
      }
      case "quitter":
        salon?.sortir(c);
        c.envoyer({ t: "sorti" });
        break;
      case "perso":
        erreur = salon ? salon.choisirPerso(c, m.id) : "Hors salon.";
        break;
      case "pret":
        erreur = salon ? salon.pret(c, m.pret) : "Hors salon.";
        break;
      case "carte":
        erreur = salon ? salon.choisirCarte(c, m.id) : "Hors salon.";
        break;
      case "bot":
        erreur = salon ? salon.bot(c, m.place, m.niveau) : "Hors salon.";
        break;
      case "persoBot":
        erreur = salon ? salon.persoBot(c, m.place, m.id) : "Hors salon.";
        break;
      case "exclure":
        erreur = salon ? salon.exclure(c, m.place) : "Hors salon.";
        break;
      case "lancer":
        erreur = salon ? salon.lancer(c, this.options.graine?.() ?? Math.floor(Math.random() * 1e9)) : "Hors salon.";
        break;
    }
    if (erreur) c.envoyer({ t: "erreur", message: erreur });
  }

  entree(c: Connexion, seq: number, entree: Entree): void {
    const s = c.salon;
    if (!s?.partie) return;
    // Un spectateur, une connexion remplacée ou un joueur hors de la
    // partie n'ont aucune prise sur elle.
    const i = s.placeDe(c.uid);
    if (i < 0 || s.places[i]?.connexion !== c) return;
    const pp = s.placePartie(c);
    if (pp >= 0) s.partie.recevoirEntree(pp, seq, entree);
  }

  deconnexion(c: Connexion): void {
    c.salon?.sortir(c);
  }

  tick(): void {
    const t = this.maintenant();
    for (const [code, s] of this.salons) {
      s.tick();
      if (!s.vide()) s.derniereActivite = t;
      else if (!s.partie && t - s.derniereActivite > DELAI_SALON_VIDE) this.salons.delete(code);
    }
  }
}
