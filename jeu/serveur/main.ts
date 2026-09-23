import { existsSync } from "node:fs";
import { CHEMIN_WS, creerServeurJeu } from "./serveur";

/*
 * Lancement du serveur de jeu.
 *
 *   npm run jeu:dev        (redémarre à chaque modification)
 *
 * Il n'écoute que la boucle locale : en production, nginx lui transmet
 * /ws/jeu comme il transmet le reste du site au port 4260. Pour jouer
 * depuis des téléphones sur le même réseau (développement), JEU_HOTE=0.0.0.0
 * l'ouvre au réseau local. En
 * production, l'environnement vient de systemd ; en développement, du
 * fichier .env s'il existe.
 */

if (existsSync(".env")) process.loadEnvFile(".env");

const secret = process.env.SESSION_SECRET ?? "";
if (!secret) console.error("jeu: SESSION_SECRET manquant : aucun ticket ne sera accepté.");

const port = Number(process.env.JEU_PORT ?? 4270);
const hote = process.env.JEU_HOTE || "127.0.0.1";
const origine = process.env.PUBLIC_ORIGIN ?? "http://127.0.0.1:4260";
const origines = [origine];
// En local, 127.0.0.1 et localhost désignent le même site.
const url = new URL(origine);
if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
  origines.push(`${url.protocol}//${url.hostname === "localhost" ? "127.0.0.1" : "localhost"}:${url.port}`);
}

const serveur = creerServeurJeu({ origines, secret });
const reel = await serveur.ecouter(port, hote);
console.log(`serveur de jeu : ws://${hote}:${reel}${CHEMIN_WS} (origines acceptées : ${origines.join(", ")})`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    // 1012 = redémarrage du service : les clients savent qu'ils peuvent revenir.
    void serveur.fermer(1012, "redémarrage").then(() => process.exit(0));
  });
}
