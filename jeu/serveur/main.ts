import { CHEMIN_WS, creerServeurJeu } from "./serveur";

/*
 * Lancement du serveur de jeu.
 *
 *   npm run jeu:dev        (redémarre à chaque modification)
 *
 * Il n'écoute que la boucle locale : en production, nginx lui transmettra
 * /ws/jeu comme il transmet déjà le reste du site au port 4260.
 */

const port = Number(process.env.JEU_PORT ?? 4270);
const origines = [process.env.PUBLIC_ORIGIN ?? "http://127.0.0.1:4260"];

const serveur = creerServeurJeu({ origines });
const reel = await serveur.ecouter(port, "127.0.0.1");
console.log(`serveur de jeu : ws://127.0.0.1:${reel}${CHEMIN_WS} (origines acceptées : ${origines.join(", ")})`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    // 1012 = redémarrage du service : un client saura qu'il peut revenir.
    void serveur.fermer(1012, "redémarrage").then(() => process.exit(0));
  });
}
