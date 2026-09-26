// Variante de Pixi sans `new Function` : la CSP du site (script-src sans
// 'unsafe-eval') ferait sinon échouer la création du rendu.
import "pixi.js/unsafe-eval";
import { Application, type Ticker } from "pixi.js";
import { JAUGE_MAX } from "../../noyau/coups";
import { ecouterClavier } from "../entrees/clavier";
import { creerTactile } from "../entrees/tactile";
import { lireManettes } from "../entrees/manette";
import type { PreferencesJeu } from "../reglages";
import type { SessionJeu } from "../session";
import { SCENE_JEU, creerScene, type OptionsScene } from "./scene";

/*
 * Rendu d'une session (locale ou réseau) dans un conteneur : application
 * Pixi, entrées, boucle d'affichage. Chargé à la demande : les pages qui
 * n'affichent pas de partie ne téléchargent pas Pixi.
 */

export type RenduMonte = {
  detruire(): void;
  preferences(p: PreferencesJeu): void;
  /** Partie locale seulement : le temps s'arrête (le réseau, lui, n'attend personne). */
  pause?(v: boolean): void;
  recommencer?(): void;
};

/** Polices des textes de coups (KaTeX, déclarée par la feuille du site) : chargées avant le premier affichage. */
async function chargerPolices(): Promise<void> {
  if (!document.fonts) return;
  const polices = ["700 48px KaTeX_Main", "48px KaTeX_Main"].map((p) => document.fonts.load(p));
  await Promise.race([Promise.all(polices), new Promise((r) => setTimeout(r, 1500))]).catch(() => {});
}

export async function monterRendu(
  conteneur: HTMLElement, session: SessionJeu, noms: readonly string[], preferences: PreferencesJeu,
  /** L'aperçu des menus : ni interface, ni son, ni clavier. */
  apercu: OptionsScene | null = null,
): Promise<RenduMonte> {
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

  const scene = creerScene(app, apercu ?? SCENE_JEU);
  scene.preferences(preferences);
  const clavier = apercu ? null : ecouterClavier(window, { KeyH: () => scene.basculerDebug() });
  const tactile = apercu ? null : creerTactile(conteneur);
  const lireEntree = () => (clavier ? clavier.entree() | lireManettes(navigator) | (tactile?.entree() ?? 0) : 0);

  // En développement, les tests de navigateur lisent l'état et peuvent
  // figer le temps (jamais en production).
  let enPause = false;
  if (process.env.NODE_ENV !== "production" && !apercu) {
    (window as unknown as { __jeu?: unknown }).__jeu = {
      monde: () => session.monde(),
      session,
      pause: (v: boolean) => { enPause = v; },
    };
  }

  app.ticker.add((ticker: Ticker) => {
    const dt = enPause ? 0 : ticker.deltaMS;
    session.avancer(dt, lireEntree);
    const vue = session.vue();
    if (tactile) {
      // Commandes tactiles : pour qui joue, et pas sur l'écran des résultats.
      const moi = vue.monde.combattants[vue.local];
      tactile.afficher(moi !== undefined && vue.monde.phase !== "finPartie");
      tactile.ultimePret(moi !== undefined && moi.jauge >= JAUGE_MAX && !moi.ko);
      scene.reserverBas(tactile.emprise());
    }
    scene.dessiner(vue, noms, dt);
  });

  let detruit = false;
  const recommencer = session.recommencer;
  return {
    detruire() {
      if (detruit) return;
      detruit = true;
      clavier?.arreter();
      tactile?.arreter();
      session.detruire?.();
      scene.detruire();
      app.destroy({ removeView: true }, { children: true });
    },
    preferences(p) {
      scene.preferences(p);
    },
    ...(recommencer ? {
      pause(v: boolean) {
        enPause = v;
      },
      recommencer() {
        recommencer();
        enPause = false;
      },
    } : {}),
  };
}
