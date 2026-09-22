// Variante de Pixi sans `new Function` : la CSP du site (script-src sans
// 'unsafe-eval') ferait sinon échouer la création du rendu.
import "pixi.js/unsafe-eval";
import { Application, type Ticker } from "pixi.js";
import { CARTES, PERSOS } from "../noyau/contenu";
import { creerMonde } from "../noyau/monde";
import { REGLAGES_STANDARD } from "../noyau/regles";
import { ecouterClavier } from "./entrees/clavier";
import { lireManettes } from "./entrees/manette";
import { creerScene } from "./rendu/scene";
import { creerSessionLocale } from "./session-locale";

/*
 * Point d'entrée du client de jeu : le SEUL module que le site importe.
 *
 * Il crée le rendu dans `conteneur`, fait tourner une partie locale
 * (entraînement contre un mannequin immobile) et libère tout dans
 * `detruire()`. Aucune logique de jeu ne remonte vers React.
 */

export type PartieLocale = {
  detruire(): void;
};

export async function monterJeu(conteneur: HTMLElement): Promise<PartieLocale> {
  const app = new Application();
  await app.init({
    resizeTo: conteneur,
    background: 0x07090f,
    antialias: true,
    preference: "webgl",
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  conteneur.appendChild(app.canvas);

  const scene = creerScene(app);
  const session = creerSessionLocale(
    () => creerMonde(CARTES[0], [PERSOS[0], PERSOS[0]], REGLAGES_STANDARD),
    0,
  );
  const noms = ["Vous", "Mannequin"];
  const clavier = ecouterClavier(window, { KeyH: () => scene.basculerDebug() });
  const lireEntree = () => clavier.entree() | lireManettes(navigator);

  // En développement, les tests de navigateur lisent l'état (jamais en production).
  if (process.env.NODE_ENV !== "production") {
    (window as unknown as { __jeu?: unknown }).__jeu = { monde: () => session.monde() };
  }

  app.ticker.add((ticker: Ticker) => {
    session.avancer(ticker.deltaMS, lireEntree);
    scene.dessiner(session.vue(), noms, ticker.deltaMS);
  });

  let detruite = false;
  return {
    detruire() {
      if (detruite) return;
      detruite = true;
      clavier.arreter();
      app.destroy({ removeView: true }, { children: true });
    },
  };
}
