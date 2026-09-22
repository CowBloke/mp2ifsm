import { Container, Graphics, Text, type Application } from "pixi.js";
import { SOUS_PIXELS } from "../noyau/constantes";
import type { Monde } from "../noyau/monde";
import { suivreCible, type Camera } from "./camera";

/*
 * Rendu du prototype : des formes simples, aucune texture.
 *
 * Ce module ne fait que LIRE le monde : il ne modifie jamais la
 * simulation. Les positions sont interpolées entre les deux derniers
 * ticks, ce qui garde un mouvement fluide sur un écran à 120 ou 144 Hz.
 */

/** Hauteur de monde visible, en pixels : fixe le zoom quelle que soit la fenêtre. */
const VUE_HAUTEUR = 900;
const COULEUR_FOND = 0x0f1218;
const COULEUR_BLOC = 0x2a3140;
const COULEUR_ARETE = 0x4a5570;
const COULEUR_COMBATTANT = 0x7aa2ff;
const COULEUR_DASH = 0xffd166;

export type Scene = {
  /** À appeler avant chaque tick : conserve la position d'avant pour interpoler. */
  memoriser(): void;
  /** `alpha` ∈ [0, 1[ : avancement entre les deux derniers ticks. */
  dessiner(alpha: number, dtMs: number): void;
};

export function creerScene(app: Application, monde: Monde): Scene {
  const pixels = (unites: number) => unites / SOUS_PIXELS;
  const l = monde.carte.limites;
  const limites = {
    gauche: pixels(l.gauche), haut: pixels(l.haut), droite: pixels(l.droite), bas: pixels(l.bas),
  };

  const vue = new Container();
  app.stage.addChild(vue);

  // Quadrillage : rend le défilement de la caméra perceptible.
  const fond = new Graphics();
  for (let x = limites.gauche; x <= limites.droite; x += 100) fond.moveTo(x, limites.haut).lineTo(x, limites.bas);
  for (let y = limites.haut; y <= limites.bas; y += 100) fond.moveTo(limites.gauche, y).lineTo(limites.droite, y);
  fond.stroke({ width: 1, color: 0xffffff, alpha: 0.05 });
  vue.addChild(fond);

  const decor = new Graphics();
  for (const s of monde.carte.solides) {
    const largeur = pixels(s.droite - s.gauche);
    decor.rect(pixels(s.gauche), pixels(s.haut), largeur, pixels(s.bas - s.haut)).fill(COULEUR_BLOC);
    decor.rect(pixels(s.gauche), pixels(s.haut), largeur, 4).fill(COULEUR_ARETE);
  }
  vue.addChild(decor);

  // Combattant : origine aux pieds, teinte selon l'état, « œil » du côté
  // où il regarde.
  const c = monde.combattants[0];
  const largeur = pixels(c.stats.largeur);
  const hauteur = pixels(c.stats.hauteur);
  const corps = new Graphics()
    .roundRect(-largeur / 2, -hauteur, largeur, hauteur, 12).fill(0xffffff)
    .rect(largeur / 2 - 20, -hauteur + 22, 10, 12).fill(COULEUR_FOND);
  vue.addChild(corps);

  const etat = new Text({
    text: "",
    style: { fill: 0xffffff, fontSize: 12, fontFamily: "ui-monospace, monospace" },
  });
  etat.alpha = 0.6;
  app.stage.addChild(etat);

  const camera: Camera = { x: pixels(c.x), y: pixels(c.y) };
  let premiere = true;
  let avantX = c.x;
  let avantY = c.y;

  return {
    memoriser() {
      avantX = c.x;
      avantY = c.y;
    },

    dessiner(alpha, dtMs) {
      const x = pixels(avantX + (c.x - avantX) * alpha);
      const y = pixels(avantY + (c.y - avantY) * alpha);
      corps.position.set(x, y);
      corps.scale.x = c.orientation;
      corps.tint = c.dash > 0 ? COULEUR_DASH : COULEUR_COMBATTANT;

      const echelle = app.screen.height / VUE_HAUTEUR;
      suivreCible(
        camera, x, y - hauteur / 2, premiere ? Infinity : dtMs,
        app.screen.width / echelle, VUE_HAUTEUR, limites,
      );
      premiere = false;
      vue.scale.set(echelle);
      vue.position.set(app.screen.width / 2 - camera.x * echelle, app.screen.height / 2 - camera.y * echelle);

      // Pixi redessine un texte à chaque changement : on ne le touche
      // que lorsqu'il change vraiment.
      const texte = `${c.auSol ? "au sol" : "en l'air"} · sauts ${c.sautsRestants} · dash ${
        c.dash > 0 ? "en cours" : c.recharge > 0 ? "en recharge" : "prêt"}`;
      if (etat.text !== texte) etat.text = texte;
      etat.position.set(12, app.screen.height - 26);
    },
  };
}
