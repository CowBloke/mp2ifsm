// Variante de Pixi sans `new Function` : la CSP du site (script-src sans
// 'unsafe-eval') ferait sinon échouer la création du rendu.
import "pixi.js/unsafe-eval";
import { Application, type Ticker } from "pixi.js";
import { creerMondeBacASable } from "../noyau/bac-a-sable";
import { creerHorloge, fractionTick, ticksAJouer } from "../noyau/horloge";
import { avancerMonde } from "../noyau/monde";
import { ecouterClavier } from "./clavier";
import { creerScene } from "./scene";

/*
 * Point d'entrée du client de jeu : le SEUL module que le site importe.
 *
 * Il crée le rendu dans `conteneur`, fait tourner la simulation du noyau
 * localement (sans serveur) à 60 ticks par seconde, et libère tout dans
 * `detruire()`. Aucune logique de jeu ne remonte vers React.
 */

export type PartieLocale = {
  detruire(): void;
};

export async function monterJeu(conteneur: HTMLElement): Promise<PartieLocale> {
  const app = new Application();
  await app.init({
    resizeTo: conteneur,
    background: 0x0f1218,
    antialias: true,
    preference: "webgl",
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  conteneur.appendChild(app.canvas);

  const monde = creerMondeBacASable();
  const scene = creerScene(app, monde);
  const clavier = ecouterClavier(window);
  const horloge = creerHorloge();

  app.ticker.add((ticker: Ticker) => {
    const ticks = ticksAJouer(horloge, ticker.deltaMS);
    for (let i = 0; i < ticks; i++) {
      scene.memoriser();
      avancerMonde(monde, [clavier.entree()]);
    }
    scene.dessiner(fractionTick(horloge), ticker.deltaMS);
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
