import { Container, Graphics, Text } from "pixi.js";
import type { Combattant } from "../../noyau/combattant";
import { SOUS_PIXELS } from "../../noyau/constantes";
import { boiteHitbox, hitboxesActives } from "../../noyau/coups";
import { POLICE } from "./couleurs";

/*
 * Représentation provisoire d'un combattant : une silhouette simple
 * teintée de la couleur de sa place, et la forme de ses coups actifs.
 * Les vrais personnages (squelettes animés) la remplaceront.
 */

const px = (u: number) => u / SOUS_PIXELS;
const DUREE_FLASH = 90;

export type VueCombattant = {
  conteneur: Container;
  /** Met à jour la vue ; (x, y) = position affichée, en pixels. */
  maj(c: Combattant, x: number, y: number, dtMs: number): void;
  /** Éclair blanc de l'impact. */
  flash(): void;
};

export function creerVueCombattant(c: Combattant, couleur: number, etiquette: string): VueCombattant {
  const l = px(c.perso.stats.largeur);
  const h = px(c.perso.stats.hauteur);
  const conteneur = new Container();

  const ombre = new Graphics().ellipse(0, 0, l * 0.7, 7).fill({ color: 0x000000, alpha: 0.35 });
  const attaques = new Graphics();
  const corps = new Container();
  const silhouette = new Graphics()
    .roundRect(-l / 2, -h, l, h, 16).fill(0xffffff)
    .stroke({ width: 3, color: 0x0b0e17, alpha: 0.9 });
  const oeil = new Graphics().roundRect(l / 2 - 22, -h + 24, 12, 14, 3).fill(0x0b0e17);
  corps.addChild(silhouette, oeil);

  const nom = new Text({
    text: etiquette,
    style: { fontFamily: POLICE, fontSize: 15, fontWeight: "800", fill: couleur, stroke: { color: 0x05070c, width: 4 } },
  });
  nom.anchor.set(0.5, 1);
  nom.y = -h - 12;

  conteneur.addChild(ombre, attaques, corps, nom);
  let flash = 0;
  let temps = 0;

  return {
    conteneur,
    flash() {
      flash = DUREE_FLASH;
    },
    maj(c, x, y, dtMs) {
      temps += dtMs;
      flash = Math.max(0, flash - dtMs);
      conteneur.visible = !c.horsJeu;
      // Gel d'impact : la cible tremble.
      const tremble = c.gel > 0 && c.hitstun > 0 ? (Math.random() - 0.5) * 6 : 0;
      conteneur.position.set(x + tremble, y);
      corps.scale.x = c.orientation;
      ombre.visible = c.auSol;

      silhouette.tint = flash > 0 ? 0xffffff : c.ko ? 0x4a5060 : c.dash > 0 ? 0xffffff : couleur;
      corps.alpha = c.invulnerable > 0 && !c.ko ? 0.45 + 0.35 * Math.sin(temps / 45) : 1;
      corps.rotation = c.ko && c.auSol ? c.orientation * -1.35 : c.hitstun > 0 ? c.orientation * -0.18 : 0;
      corps.pivot.y = c.ko && c.auSol ? -h / 2 : 0;
      corps.y = c.ko && c.auSol ? -h / 2 + 12 : 0;

      // Forme des coups actifs : lisible tant que les animations n'existent pas.
      attaques.clear();
      for (const hb of hitboxesActives(c)) {
        const b = boiteHitbox(c, hb);
        attaques
          .roundRect(px(b.gauche - c.x), px(b.haut - c.y), px(b.droite - b.gauche), px(b.bas - b.haut), 12)
          .fill({ color: 0xffffff, alpha: 0.5 })
          .stroke({ width: 3, color: couleur, alpha: 0.9 });
      }
    },
  };
}
