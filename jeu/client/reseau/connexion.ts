import type { Entree } from "../../noyau/entrees";
import {
  B_ETAT, B_PING, B_PONG, CHEMIN_WS, VERSION_PROTOCOLE, coderEntree, coderPing, decoderBinaire,
  type DebutPartie, type EtatSalon, type MessageClient, type MessageServeur,
} from "../../protocole/messages";

/*
 * Connexion au serveur de jeu : authentification par ticket, messages de
 * contrôle, entrées, instantanés, et reconnexion automatique (avec
 * reprise de sa place). Un « magasin » d'état simple permet à React de
 * s'abonner (useSyncExternalStore) sans jamais voir le temps réel.
 */

export type EtatConnexion = {
  statut: "connexion" | "connecte" | "reconnexion" | "refuse" | "ferme";
  uid: string | null;
  nom: string;
  salon: EtatSalon | null;
  partie: DebutPartie | null;
  /** Dernière erreur signalée par le serveur (passagère). */
  erreur: string | null;
  /** Refus définitif (version périmée, session expirée). */
  refus: string | null;
  /** Temps d'aller-retour mesuré, en ms. */
  rtt: number | null;
};

export type OptionsConnexion = {
  /** URL WebSocket ; par défaut, même origine que la page. */
  url?: string | null;
  /** Obtient un ticket signé auprès du site (action serveur). */
  ticket: () => Promise<string>;
  /** Implémentation WebSocket (tests sous Node). */
  WebSocket?: typeof WebSocket;
};

export type ConnexionJeu = {
  etat(): EtatConnexion;
  abonner(f: () => void): () => void;
  envoyer(m: Exclude<MessageClient, { t: "bonjour" }>): void;
  /**
   * Envoie l'entrée d'un tick et renvoie son numéro. La numérotation vit
   * dans la connexion et ne recule jamais, même si l'écran de jeu est
   * remonté : le serveur ignore les numéros déjà vus.
   */
  entree(entree: Entree): number;
  /** Chaque abonné reçoit les octets bruts d'un instantané (et les lit lui-même). */
  surInstantane(f: (octets: Uint8Array) => void): () => void;
  effacerErreur(): void;
  fermer(): void;
};

const ATTENTES = [300, 1000, 2000, 4000];

export function urlParDefaut(): string {
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${CHEMIN_WS}`;
}

export function connecterJeu(options: OptionsConnexion): ConnexionJeu {
  const WS = options.WebSocket ?? WebSocket;
  const url = options.url ?? urlParDefaut();
  let etat: EtatConnexion = {
    statut: "connexion", uid: null, nom: "", salon: null, partie: null, erreur: null, refus: null, rtt: null,
  };
  const abonnes = new Set<() => void>();
  const lecteursEtat = new Set<(octets: Uint8Array) => void>();
  let ws: WebSocket | null = null;
  let tentatives = 0;
  let ferme = false;
  let ping: ReturnType<typeof setInterval> | null = null;
  let seq = 0;
  const origine = performance.now();
  /** Où se remettre après une reconnexion. */
  let reprise: { t: "rejoindre" | "regarder"; code: string } | null = null;

  function changer(partiel: Partial<EtatConnexion>) {
    etat = { ...etat, ...partiel };
    for (const f of abonnes) f();
  }

  function envoyerBrut(texte: string | Uint8Array) {
    if (ws && ws.readyState === WS.OPEN) ws.send(texte);
  }

  function recevoir(m: MessageServeur) {
    switch (m.t) {
      case "bienvenue":
        tentatives = 0;
        changer({ statut: "connecte", uid: m.uid, nom: m.nom });
        if (reprise) envoyerBrut(JSON.stringify(reprise));
        break;
      case "refus":
        ferme = true;
        changer({ statut: "refuse", refus: m.raison });
        break;
      case "erreur":
        changer({ erreur: m.message });
        break;
      case "salon": {
        const joueur = m.salon.places.some((p) => p?.uid === etat.uid);
        reprise = { t: joueur ? "rejoindre" : "regarder", code: m.salon.code };
        // Retour au salon : la partie est finie.
        changer({ salon: m.salon, partie: m.salon.etat === "attente" ? null : etat.partie });
        break;
      }
      case "debut":
        changer({ partie: m.partie });
        break;
      case "sorti":
        reprise = null;
        changer({ salon: null, partie: null });
        break;
    }
  }

  function ouvrir() {
    const s = new WS(url);
    ws = s;
    s.binaryType = "arraybuffer";
    s.onopen = () => {
      options.ticket()
        .then((ticket) => envoyerBrut(JSON.stringify({ t: "bonjour", v: VERSION_PROTOCOLE, ticket })))
        .catch(() => s.close());
      ping = setInterval(() => envoyerBrut(coderPing(B_PING, Math.round(performance.now() - origine))), 1000);
    };
    s.onmessage = (e: MessageEvent) => {
      if (typeof e.data === "string") {
        try {
          recevoir(JSON.parse(e.data) as MessageServeur);
        } catch {
          /* message illisible : ignoré */
        }
        return;
      }
      const octets = new Uint8Array(e.data as ArrayBuffer);
      const m = decoderBinaire(octets);
      if (m.b === B_PONG) changer({ rtt: Math.round(performance.now() - origine) - m.horodatage });
      else if (m.b === B_ETAT) for (const f of lecteursEtat) f(octets);
    };
    s.onclose = () => {
      if (ping) clearInterval(ping);
      ping = null;
      if (ws !== s) return;
      ws = null;
      if (ferme) {
        if (etat.statut !== "refuse") changer({ statut: "ferme" });
        return;
      }
      changer({ statut: "reconnexion" });
      setTimeout(ouvrir, ATTENTES[Math.min(tentatives++, ATTENTES.length - 1)]);
    };
  }

  ouvrir();

  return {
    etat: () => etat,
    abonner(f) {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    envoyer(m) {
      if (m.t === "rejoindre" || m.t === "regarder") reprise = { t: m.t, code: m.code };
      if (m.t === "quitter") reprise = null;
      envoyerBrut(JSON.stringify(m));
    },
    entree(entree) {
      seq++;
      envoyerBrut(coderEntree(seq, entree));
      return seq;
    },
    surInstantane(f) {
      lecteursEtat.add(f);
      return () => lecteursEtat.delete(f);
    },
    effacerErreur() {
      if (etat.erreur) changer({ erreur: null });
    },
    fermer() {
      ferme = true;
      // Tout de suite : une page qui revient au jeu doit en ouvrir une neuve.
      if (etat.statut !== "refuse") changer({ statut: "ferme" });
      ws?.close(1000, "départ");
    },
  };
}
