// Variante de Pixi sans `new Function` : la CSP du site (script-src sans
// 'unsafe-eval') ferait sinon échouer la création du rendu.
import "pixi.js/unsafe-eval";
import { Application, type Ticker } from "pixi.js";
import { CARTES, PERSOS, PERSOS_ENTRAINEMENT } from "../noyau/contenu";
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

/** Polices des textes de coups (KaTeX, déclarée par la feuille du site) : chargées avant le premier affichage. */
async function chargerPolices(): Promise<void> {
  if (!document.fonts) return;
  const polices = ["700 48px KaTeX_Main", "48px KaTeX_Main"].map((p) => document.fonts.load(p));
  await Promise.race([Promise.all(polices), new Promise((r) => setTimeout(r, 1500))]).catch(() => {});
}

export type OptionsJeu = {
  /** Nom affiché pour le joueur de cet écran. */
  pseudo: string;
};

export async function monterJeu(conteneur: HTMLElement, options: OptionsJeu): Promise<PartieLocale> {
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
  const session = creerSessionLocale(
    () => creerMonde(CARTES[0], [PERSOS[0], PERSOS_ENTRAINEMENT[0]], REGLAGES_STANDARD),
    0,
  );
  const noms = [options.pseudo, "Mannequin"];
  const clavier = ecouterClavier(window, { KeyH: () => scene.basculerDebug() });
  const lireEntree = () => clavier.entree() | lireManettes(navigator);

  // En développement, les tests de navigateur lisent l'état et peuvent
  // figer le temps (jamais en production).
  let enPause = false;
  if (process.env.NODE_ENV !== "production") {
    (window as unknown as { __jeu?: unknown }).__jeu = {
      monde: () => session.monde(),
      pause: (v: boolean) => { enPause = v; },
    };
  }

  app.ticker.add((ticker: Ticker) => {
    session.avancer(enPause ? 0 : ticker.deltaMS, lireEntree);
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
