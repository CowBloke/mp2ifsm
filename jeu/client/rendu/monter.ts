// Variante de Pixi sans `new Function` : la CSP du site (script-src sans
// 'unsafe-eval') ferait sinon échouer la création du rendu.
import "pixi.js/unsafe-eval";
import { Application, type Ticker } from "pixi.js";
import { ecouterClavier } from "../entrees/clavier";
import { lireManettes } from "../entrees/manette";
import type { SessionJeu } from "../session";
import { creerScene } from "./scene";

/*
 * Rendu d'une session (locale ou réseau) dans un conteneur : application
 * Pixi, entrées, boucle d'affichage. Chargé à la demande : les pages qui
 * n'affichent pas de partie ne téléchargent pas Pixi.
 */

export type RenduMonte = {
  detruire(): void;
};

/** Polices des textes de coups (KaTeX, déclarée par la feuille du site) : chargées avant le premier affichage. */
async function chargerPolices(): Promise<void> {
  if (!document.fonts) return;
  const polices = ["700 48px KaTeX_Main", "48px KaTeX_Main"].map((p) => document.fonts.load(p));
  await Promise.race([Promise.all(polices), new Promise((r) => setTimeout(r, 1500))]).catch(() => {});
}

export async function monterRendu(conteneur: HTMLElement, session: SessionJeu, noms: readonly string[]): Promise<RenduMonte> {
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
  await chargerPolices();

  const scene = creerScene(app);
  const clavier = ecouterClavier(window, { KeyH: () => scene.basculerDebug() });
  const lireEntree = () => clavier.entree() | lireManettes(navigator);

  // En développement, les tests de navigateur lisent l'état et peuvent
  // figer le temps (jamais en production).
  let enPause = false;
  if (process.env.NODE_ENV !== "production") {
    (window as unknown as { __jeu?: unknown }).__jeu = {
      monde: () => session.monde(),
      session,
      pause: (v: boolean) => { enPause = v; },
    };
  }

  app.ticker.add((ticker: Ticker) => {
    session.avancer(enPause ? 0 : ticker.deltaMS, lireEntree);
    scene.dessiner(session.vue(), noms, ticker.deltaMS);
  });

  let detruit = false;
  return {
    detruire() {
      if (detruit) return;
      detruit = true;
      clavier.arreter();
      session.detruire?.();
      app.destroy({ removeView: true }, { children: true });
    },
  };
}
