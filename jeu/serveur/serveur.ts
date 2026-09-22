import { createServer, STATUS_CODES, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";

/*
 * Serveur de jeu : un processus Node séparé du site Next.js.
 *
 * Phase 0 (faisabilité) : il répond à /ws/jeu/sante et renvoie en écho
 * les messages binaires reçus sur /ws/jeu, de quoi mesurer le temps
 * d'aller-retour. Ni salon, ni simulation, ni authentification pour
 * l'instant : ils viendront sur cette même base.
 */

export const CHEMIN_WS = "/ws/jeu";
export const CHEMIN_SANTE = "/ws/jeu/sante";

/** Un message de jeu tient en quelques centaines d'octets. */
const TAILLE_MAX_MESSAGE = 4 * 1024;

export type OptionsServeur = {
  /** Origines de page acceptées (en-tête Origin envoyé par les navigateurs). */
  origines: readonly string[];
  /** Intervalle des pings de maintien ; un client muet au ping suivant est coupé. */
  intervallePingMs?: number;
};

export type ServeurJeu = {
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
  // Pas de compression : elle coûte du CPU au Pi et de la latence, pour
  // des messages déjà minuscules.
  const wss = new WebSocketServer({
    noServer: true, perMessageDeflate: false, maxPayload: TAILLE_MAX_MESSAGE,
  });

  const http = createServer((req, res) => {
    if (req.method === "GET" && chemin(req) === CHEMIN_SANTE) {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({
        ok: true,
        connexions: wss.clients.size,
        depuisS: Math.floor((Date.now() - debut) / 1000),
      }));
      return;
    }
    res.writeHead(404).end();
  });

  http.on("upgrade", (req, socket, tete) => {
    if (chemin(req) !== CHEMIN_WS) return refuser(socket, 404);
    // Un navigateur envoie toujours Origin : on refuse les pages des
    // autres sites. Un outil sans navigateur n'en envoie pas ; il devra
    // présenter un ticket quand l'authentification existera.
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
    ws.on("pong", () => sansReponse.delete(ws));
    ws.on("close", () => sansReponse.delete(ws));
    ws.on("error", (err) => console.error("jeu: connexion:", err.message));
    ws.on("message", (donnees, binaire) => {
      if (!binaire) {
        ws.close(1003, "binaire attendu");
        return;
      }
      ws.send(donnees as Buffer, { binary: true });
    });
  });

  return {
    ecouter(port, hote) {
      return new Promise((resolve, reject) => {
        http.once("error", reject);
        http.listen(port, hote, () => {
          http.off("error", reject);
          resolve((http.address() as AddressInfo).port);
        });
      });
    },

    async fermer(code = 1001, raison = "arrêt du serveur") {
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
