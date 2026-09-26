import { Container, Graphics } from "pixi.js";
import type { Point } from "../../noyau/carte";
import { SOUS_PIXELS, MS_PAR_TICK } from "../../noyau/constantes";
import type { Monde } from "../../noyau/monde";
import { apparenceDe } from "../persos";
import type { DessinEntite, EtatVisuelEntite } from "../persos/types";

/*
 * Rendu des entités (projectiles, zones, pièges…) : chacune est dessinée
 * par l'apparence de son lanceur ; une entité sans dessin prend un disque
 * neutre. Les effets brefs (explosions) restent visibles un instant après
 * leur disparition. Lecture seule de l'état.
 */

const px = (u: number) => u / SOUS_PIXELS;

type Vivante = {
  conteneur: Container;
  dessin: DessinEntite;
  etat: EtatVisuelEntite;
  proprio: number;
  def: string;
  /** Instant de la disparition (ms, horloge du rendu), null tant qu'elle vit. */
  disparue: number | null;
  x: number;
  y: number;
};

const REPLI: DessinEntite = {
  creer() {
    const c = new Container();
    c.addChild(new Graphics().circle(0, 0, 14).fill({ color: 0xffffff, alpha: 0.9 }).stroke({ width: 3, color: 0x0b0d14 }));
    return c;
  },
};

export type RenduEntites = {
  maj(monde: Monde, positions: ReadonlyMap<number, Point>, mains: readonly Point[], alpha: number, dtMs: number): void;
};

/** `mains` : position (px) de la main avant de chaque combattant, pour les cordes. */
export function creerRenduEntites(couche: Container): RenduEntites {
  const vivantes = new Map<number, Vivante>();
  const liens = new Graphics();
  couche.addChild(liens);
  let temps = 0;

  return {
    maj(monde, positions, mains, alpha, dtMs) {
      temps += dtMs;
      const presentes = new Set<number>();
      for (const e of monde.entites) {
        presentes.add(e.id);
        let v = vivantes.get(e.id);
        // Nouvelle partie : les numéros repartent de zéro. Un dessin qui s'efface
        // ou qui montre autre chose ne sert pas à la nouvelle entité.
        if (v && (v.disparue !== null || v.def !== e.def || v.proprio !== e.proprio)) {
          v.conteneur.destroy({ children: true });
          vivantes.delete(e.id);
          v = undefined;
        }
        if (!v) {
          const proprio = monde.combattants[e.proprio];
          const ap = apparenceDe(proprio.perso.id);
          const dessin = ap.entites?.[e.def] ?? REPLI;
          const variante = monde.combattants.slice(0, e.proprio).filter((o) => o.perso.id === proprio.perso.id).length;
          const conteneur = dessin.creer(ap.palettes[variante % ap.palettes.length]);
          couche.addChild(conteneur);
          const def = proprio.perso.entites?.[e.def];
          v = {
            conteneur, dessin, proprio: e.proprio, def: e.def, disparue: null, x: 0, y: 0,
            etat: { age: 0, duree: def?.duree ?? 1, vx: 0, vy: 0, orientation: 1, accroche: false, fin: 0 },
          };
          vivantes.set(e.id, v);
        }
        const p = positions.get(e.id) ?? e;
        v.x = px(p.x);
        v.y = px(p.y);
        Object.assign(v.etat, { age: e.age + alpha, vx: e.vx, vy: e.vy, orientation: e.orientation, accroche: e.accroche, fin: 0 });
      }

      liens.clear();
      for (const [id, v] of vivantes) {
        if (!presentes.has(id) && v.disparue === null) {
          v.disparue = temps;
          if (!v.dessin.remanence) {
            v.conteneur.destroy({ children: true });
            vivantes.delete(id);
            continue;
          }
        }
        if (v.disparue !== null) {
          const fin = (temps - v.disparue) / (v.dessin.remanence ?? 1);
          if (fin >= 1) {
            v.conteneur.destroy({ children: true });
            vivantes.delete(id);
            continue;
          }
          v.etat.fin = fin;
          v.etat.age += dtMs / MS_PAR_TICK;
        }
        v.conteneur.position.set(v.x, v.y);
        if (v.dessin.rotation && !v.etat.accroche) v.conteneur.rotation += v.dessin.rotation * (dtMs / MS_PAR_TICK) * (v.etat.vx >= 0 ? 1 : -1);
        v.dessin.animer?.(v.conteneur, v.etat, temps);
        if (v.dessin.lien !== undefined && v.disparue === null) {
          const main = mains[v.proprio];
          if (main) liens.moveTo(main.x, main.y).lineTo(v.x, v.y).stroke({ width: 3, color: v.dessin.lien, alpha: 0.9 });
        }
      }
    },
  };
}
