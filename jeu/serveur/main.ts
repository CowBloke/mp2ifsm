import { existsSync } from "node:fs";
import { CHEMIN_WS, creerServeurJeu } from "./serveur";

/*
 * Lancement du serveur de jeu.
 *
 *   npm run jeu:dev        (redémarre à chaque modification)
 *
 * Il n'écoute que la boucle locale : en production, nginx lui transmet
 * /ws/jeu comme il transmet le reste du site au port 4260. En
 * production, l'environnement vient de systemd ; en développement, du
 * fichier .env s'il existe.
 */

if (existsSync(".env")) process.loadEnvFile(".env");

const secret = process.env.SESSION_SECRET ?? "";
if (!secret) console.error("jeu: SESSION_SECRET manquant : aucun ticket ne sera accepté.");

const port = Number(process.env.JEU_PORT ?? 4270);
const origine = process.env.PUBLIC_ORIGIN ?? "http://127.0.0.1:4260";
const origines = [origine];
// En local, 127.0.0.1 et localhost désignent le même site.
const url = new URL(origine);
if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
  origines.push(`${url.protocol}//${url.hostname === "localhost" ? "127.0.0.1" : "localhost"}:${url.port}`);
}

const serveur = creerServeurJeu({ origines, secret });
const reel = await serveur.ecouter(port, "127.0.0.1");
console.log(`serveur de jeu : ws://127.0.0.1:${reel}${CHEMIN_WS} (origines acceptées : ${origines.join(", ")})`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    // 1012 = redémarrage du service : les clients savent qu'ils peuvent revenir.
    void serveur.fermer(1012, "redémarrage").then(() => process.exit(0));
  });
}
