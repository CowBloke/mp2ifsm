import { createServer, STATUS_CODES, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { B_ENTREE, B_PING, B_PONG, CHEMIN_WS, coderPing, decoderBinaire } from "../protocole/messages";
import { demarrerBoucle, type Boucle } from "./boucle";
import { Hall, type OptionsHall } from "./hall";
import type { Connexion } from "./salon";
import { validerMessage } from "./validation";

/*
 * Serveur de jeu : un processus Node séparé du site Next.js.
 *
 * /ws/jeu        WebSocket : contrôle en JSON, temps réel en binaire
 * /ws/jeu/sante  état du serveur (réservé à la boucle locale par nginx)
 *
 * Le serveur fait foi : il ne reçoit des clients que des entrées et des
 * demandes (rejoindre, se déclarer prêt…), jamais un état.
 */

export { CHEMIN_WS };
export const CHEMIN_SANTE = "/ws/jeu/sante";

/** Un message de contrôle ou d'entrée tient en quelques dizaines d'octets. */
const TAILLE_MAX_MESSAGE = 4 * 1024;
/** Au-delà, les instantanés ne sont plus envoyés à ce client : il ne suit pas. */
const RETARD_MAX_OCTETS = 1_000_000;
/** Messages par seconde : contrôle, et entrées (60 attendues). */
const DEBIT_CONTROLE = 30;
const DEBIT_ENTREES = 120;
const DELAI_AUTHENTIFICATION = 10_000;

export type OptionsServeur = OptionsHall & {
  /** Origines de page acceptées (en-tête Origin envoyé par les navigateurs). */
  origines: readonly string[];
  /** Intervalle des pings de maintien ; un client muet au ping suivant est coupé. */
  intervallePingMs?: number;
  /** Faux : pas de boucle automatique (tests qui avancent le temps eux-mêmes). */
  boucle?: boolean;
};

export type ServeurJeu = {
  hall: Hall;
  /** Écoute et renvoie le port réel (utile avec le port 0). */
  ecouter(port: number, hote: string): Promise<number>;
  fermer(code?: number, raison?: string): Promise<void>;
};

function chemin(req: IncomingMessage): string {
  return new URL(req.url ?? "/", "http://serveur").pathname;
}

function refuser(socket: Duplex, statut: number): void {
  socket.end(`HTTP/1.1 ${statut} ${STATUS_CODES[statut]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

export function creerServeurJeu(options: OptionsServeur): ServeurJeu {
  const debut = Date.now();
  const hall = new Hall(options);
  let prochainId = 1;
  let boucle: Boucle | null = null;
  let retards = 0;

  // Pas de compression : elle coûte du CPU au Pi et de la latence, pour
  // des messages déjà minuscules.
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: TAILLE_MAX_MESSAGE });

  const http = createServer((req, res) => {
    if (req.method === "GET" && chemin(req) === CHEMIN_SANTE) {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({
        ok: true,
        connexions: wss.clients.size,
        salons: hall.nombreSalons,
        parties: hall.nombreParties,
        retards,
        depuisS: Math.floor((Date.now() - debut) / 1000),
      }));
      return;
    }
    res.writeHead(404).end();
  });

  http.on("upgrade", (req, socket, tete) => {
    if (chemin(req) !== CHEMIN_WS) return refuser(socket, 404);
    // Un navigateur envoie toujours Origin : on refuse les pages des
    // autres sites. Les outils sans navigateur doivent de toute façon
    // présenter un ticket signé.
    const origine = req.headers.origin;
    if (origine !== undefined && !options.origines.includes(origine)) return refuser(socket, 403);
    wss.handleUpgrade(req, socket, tete, (ws) => wss.emit("connection", ws, req));
  });

  // Maintien : Cloudflare et nginx coupent une connexion trop longtemps
  // muette, et un client disparu sans prévenir doit être libéré.
  const sansReponse = new Set<WebSocket>();
  const maintien = setInterval(() => {
    for (const ws of wss.clients) {
      if (sansReponse.has(ws)) {
        ws.terminate();
        continue;
      }
      sansReponse.add(ws);
      ws.ping();
    }
  }, options.intervallePingMs ?? 20_000);
  maintien.unref();

  wss.on("connection", (ws) => {
    const c: Connexion = {
      id: prochainId++,
      uid: null,
      nom: "",
      role: "member",
      salon: null,
      envoyer(m) {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
      },
      envoyerOctets(o) {
        if (ws.readyState === ws.OPEN && ws.bufferedAmount < RETARD_MAX_OCTETS) ws.send(o, { binary: true });
      },
      fermer(code, raison) {
        ws.close(code, raison);
      },
    };
    const debit = { seconde: 0, controle: 0, entrees: 0 };
    // Les messages d'une connexion sont traités dans l'ordre, même quand
    // l'un d'eux attend (vérification du ticket).
    let file: Promise<void> = Promise.resolve();
    const authentification = setTimeout(() => {
      if (c.uid === null) c.fermer(4003, "authentification attendue");
    }, DELAI_AUTHENTIFICATION);

    ws.on("pong", () => sansReponse.delete(ws));
    ws.on("error", (err) => console.error("jeu: connexion:", err.message));
    ws.on("close", () => {
      clearTimeout(authentification);
      sansReponse.delete(ws);
      hall.deconnexion(c);
    });
    ws.on("message", (donnees, binaire) => {
      const seconde = Math.floor(Date.now() / 1000);
      if (seconde !== debit.seconde) Object.assign(debit, { seconde, controle: 0, entrees: 0 });
      if (!binaire) {
        if (++debit.controle > DEBIT_CONTROLE) return c.fermer(1008, "trop de messages");
        const m = validerMessage(donnees.toString());
        if (!m) return c.fermer(1008, "message invalide");
        file = file.then(() => hall.recevoir(c, m)).catch((err) => console.error("jeu: message:", err));
        return;
      }
      if (c.uid === null) return c.fermer(4003, "non authentifié");
      let message;
      try {
        message = decoderBinaire(new Uint8Array(donnees as Buffer));
      } catch {
        return c.fermer(1008, "message invalide");
      }
      if (message.b === B_ENTREE) {
        if (++debit.entrees <= DEBIT_ENTREES) hall.entree(c, message.seq, message.entree);
      } else if (message.b === B_PING) {
        c.envoyerOctets(coderPing(B_PONG, message.horodatage));
      }
    });
  });

  return {
    hall,
    ecouter(port, hote) {
      return new Promise((resolve, reject) => {
        http.once("error", reject);
        http.listen(port, hote, () => {
          http.off("error", reject);
          if (options.boucle !== false) {
            boucle = demarrerBoucle(() => hall.tick(), (perdus) => {
              retards += perdus;
            });
          }
          resolve((http.address() as AddressInfo).port);
        });
      });
    },

    async fermer(code = 1001, raison = "arrêt du serveur") {
      boucle?.arreter();
      clearInterval(maintien);
      for (const ws of wss.clients) ws.close(code, raison);
      // Un client qui ne termine pas la fermeture est coupé net.
      const couperet = setTimeout(() => {
        for (const ws of wss.clients) ws.terminate();
      }, 1000);
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      clearTimeout(couperet);
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
