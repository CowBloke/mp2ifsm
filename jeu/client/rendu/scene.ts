import { Container, Graphics, type Application } from "pixi.js";
import type { Carte } from "../../noyau/carte";
import { boiteDe } from "../../noyau/combattant";
import { SOUS_PIXELS } from "../../noyau/constantes";
import { boiteHitbox, hitboxesActives } from "../../noyau/coups";
import { suivreCible, type Camera } from "../camera";
import type { VueJeu } from "../session-locale";
import { creerVueCombattant, type VueCombattant } from "./combattants";
import { couleurPlace } from "./couleurs";
import { creerDecor } from "./decor";
import { creerEffets } from "./effets";
import { creerHud } from "./hud";

/*
 * Scène du jeu : couches du monde (décor, combattants, effets), caméra
 * et interface. Elle ne fait que LIRE la vue fournie par la session ;
 * elle ne modifie jamais la simulation.
 */

/** Hauteur de monde visible pour un joueur, en pixels : fixe le zoom. */
const VUE_HAUTEUR = 900;
const px = (u: number) => u / SOUS_PIXELS;

export type Scene = {
  dessiner(vue: VueJeu, noms: readonly string[], dtMs: number): void;
  basculerDebug(): void;
};

export function creerScene(app: Application): Scene {
  const monde = new Container();
  const coucheDecor = new Container();
  const coucheCombattants = new Container();
  const coucheEffets = new Container();
  const debug = new Graphics();
  monde.addChild(coucheDecor, coucheCombattants, coucheEffets, debug);
  const ecran = new Container();
  app.stage.addChild(monde, ecran);

  const effets = creerEffets(coucheEffets);
  const hud = creerHud(ecran);
  const camera: Camera = { x: 0, y: 0 };
  let carte: Carte | null = null;
  let vues: VueCombattant[] = [];
  let signature = "";
  let premiere = true;
  let afficherDebug = false;

  function reconstruire(vue: VueJeu, noms: readonly string[]) {
    const m = vue.monde;
    if (m.carte !== carte) {
      coucheDecor.removeChildren().forEach((c) => c.destroy({ children: true }));
      coucheDecor.addChild(creerDecor(m.carte));
      carte = m.carte;
      premiere = true;
    }
    const s = m.combattants.map((c) => c.perso.id).join() + "|" + noms.join();
    if (s !== signature) {
      coucheCombattants.removeChildren().forEach((c) => c.destroy({ children: true }));
      vues = m.combattants.map((c, i) => creerVueCombattant(c, couleurPlace(i), noms[i] ?? `J${i + 1}`));
      // Le joueur local passe devant les autres.
      vues.forEach((v, i) => { if (i !== vue.local) coucheCombattants.addChild(v.conteneur); });
      if (vues[vue.local]) coucheCombattants.addChild(vues[vue.local].conteneur);
      signature = s;
    }
  }

  return {
    basculerDebug() {
      afficherDebug = !afficherDebug;
    },

    dessiner(vue, noms, dtMs) {
      const m = vue.monde;
      reconstruire(vue, noms);

      for (const e of vue.evenements) {
        const source = m.combattants[e.source];
        switch (e.type) {
          case "touche":
          case "armure":
            effets.etincelles(px(e.x), px(e.y), source?.orientation ?? 1, e.valeur, couleurPlace(e.source));
            effets.secousse(Math.min(16, 2 + e.valeur / 9));
            vues[e.cible]?.flash();
            break;
          case "ko":
            effets.etincelles(px(e.x), px(e.y), source?.orientation ?? 1, 220, 0xffffff);
            effets.secousse(22);
            break;
          case "contre":
            effets.etincelles(px(e.x), px(e.y), -(m.combattants[e.cible]?.orientation ?? 1), 120, 0xffd166);
            effets.secousse(8);
            break;
          case "atterrissage":
            if (e.valeur > 1500) effets.poussiere(px(e.x), px(e.y), 6);
            break;
          case "dash":
            effets.poussiere(px(e.x), px(e.y), 4);
            break;
          case "saut":
            if (e.valeur === 1) effets.poussiere(px(e.x), px(e.y), 3);
            break;
        }
      }

      m.combattants.forEach((c, i) => {
        const p = vue.positions[i] ?? c;
        vues[i]?.maj(c, px(p.x), px(p.y), dtMs);
      });
      effets.maj(dtMs);

      // Caméra : sur le joueur local, ou toute l'arène pour un spectateur.
      const largeur = app.screen.width;
      const hauteur = app.screen.height;
      const l = m.carte.limites;
      const limites = { gauche: px(l.gauche), haut: px(l.haut), droite: px(l.droite), bas: px(l.bas) };
      let echelle: number;
      let cx: number;
      let cy: number;
      const local = m.combattants[vue.local];
      if (local) {
        echelle = hauteur / VUE_HAUTEUR;
        const p = vue.positions[vue.local];
        cx = px(p.x);
        cy = px(p.y - local.perso.stats.hauteur / 2);
      } else {
        echelle = Math.min(largeur / (limites.droite - limites.gauche), hauteur / (limites.bas - limites.haut));
        cx = (limites.gauche + limites.droite) / 2;
        cy = (limites.haut + limites.bas) / 2;
      }
      suivreCible(camera, cx, cy, premiere ? Infinity : dtMs, largeur / echelle, hauteur / echelle, limites);
      premiere = false;
      const d = effets.decalage();
      monde.scale.set(echelle);
      monde.position.set(largeur / 2 - camera.x * echelle + d.x, hauteur / 2 - camera.y * echelle + d.y);

      // Boîtes de collision et de coups (touche H).
      debug.clear();
      if (afficherDebug) {
        for (const c of m.combattants) {
          if (c.horsJeu) continue;
          const b = boiteDe(c);
          debug.rect(px(b.gauche), px(b.haut), px(b.droite - b.gauche), px(b.bas - b.haut))
            .stroke({ width: 2, color: 0x3ddc84 });
          for (const hb of hitboxesActives(c)) {
            const h = boiteHitbox(c, hb);
            debug.rect(px(h.gauche), px(h.haut), px(h.droite - h.gauche), px(h.bas - h.haut))
              .fill({ color: 0xff3b3b, alpha: 0.35 }).stroke({ width: 2, color: 0xff3b3b });
          }
        }
        const z = m.carte.zoneVie;
        debug.rect(px(z.gauche), px(z.haut), px(z.droite - z.gauche), px(z.bas - z.haut))
          .stroke({ width: 4, color: 0xff3b3b, alpha: 0.5 });
      }

      hud.maj(m, noms, largeur, hauteur, dtMs);
    },
  };
}
