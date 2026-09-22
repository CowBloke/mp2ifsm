import { Container, FillGradient, Graphics } from "pixi.js";
import type { Carte } from "../../noyau/carte";
import { SOUS_PIXELS } from "../../noyau/constantes";

/*
 * Décor d'une carte : fond, blocs pleins et plateformes. Dessiné une
 * fois ; seule la caméra le déplace.
 */

const px = (u: number) => u / SOUS_PIXELS;

export function creerDecor(carte: Carte): Container {
  const decor = new Container();
  const l = carte.limites;
  const [g, h, d, b] = [px(l.gauche), px(l.haut), px(l.droite), px(l.bas)];

  // Ciel : dégradé sombre, plus large que l'arène pour ne jamais voir de bord.
  const ciel = new FillGradient({
    type: "linear",
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: "#161b2e" },
      { offset: 0.65, color: "#0f1320" },
      { offset: 1, color: "#07090f" },
    ],
    textureSpace: "local",
  });
  decor.addChild(new Graphics().rect(g - 2000, h - 2000, d - g + 4000, b - h + 4000).fill(ciel));

  // Quadrillage discret : rend le mouvement de la caméra perceptible.
  const grille = new Graphics();
  for (let x = Math.ceil(g / 100) * 100; x <= d; x += 100) grille.moveTo(x, h).lineTo(x, b);
  for (let y = Math.ceil(h / 100) * 100; y <= b; y += 100) grille.moveTo(g, y).lineTo(d, y);
  grille.stroke({ width: 1, color: 0x8aa0ff, alpha: 0.035 });
  decor.addChild(grille);

  const blocs = new Graphics();
  for (const s of carte.solides) {
    const [x, y, w, hauteur] = [px(s.gauche), px(s.haut), px(s.droite - s.gauche), px(s.bas - s.haut)];
    blocs.roundRect(x, y, w, hauteur, 10).fill(0x232a3d);
    blocs.roundRect(x, y, w, 10, 5).fill(0x46507a);
    blocs.rect(x + 8, y + 10, w - 16, 2).fill({ color: 0xffffff, alpha: 0.06 });
  }
  for (const p of carte.plateformes) {
    const [x, y, w] = [px(p.gauche), px(p.y), px(p.droite - p.gauche)];
    blocs.roundRect(x, y, w, 12, 6).fill(0x2c3450);
    blocs.roundRect(x, y, w, 4, 2).fill(0x6c7bb8);
  }
  decor.addChild(blocs);
  return decor;
}
