import { Graphics } from "pixi.js";

/*
 * Traînées des coups : chaque membre qui frappe laisse un ruban effilé
 * qui s'estompe en ~0,15 s. Un seul Graphics redessiné par image, des
 * quadrilatères dont largeur et opacité décroissent avec l'âge.
 */

const DUREE = 150;

type Point = { x: number; y: number; age: number };
type Trace = { points: Point[]; couleur: number; largeur: number };

export type Trainees = {
  graphics: Graphics;
  /** Ajoute la position courante du membre identifié par `cle`. */
  ajouter(cle: string, x: number, y: number, couleur: number, largeur: number): void;
  maj(dtMs: number): void;
};

export function creerTrainees(): Trainees {
  const graphics = new Graphics();
  const traces = new Map<string, Trace>();

  return {
    graphics,
    ajouter(cle, x, y, couleur, largeur) {
      let t = traces.get(cle);
      if (!t) {
        t = { points: [], couleur, largeur };
        traces.set(cle, t);
      }
      t.couleur = couleur;
      t.largeur = largeur;
      const dernier = t.points[t.points.length - 1];
      if (!dernier || Math.hypot(dernier.x - x, dernier.y - y) > 2) t.points.push({ x, y, age: 0 });
    },
    maj(dtMs) {
      graphics.clear();
      for (const [cle, t] of traces) {
        for (const p of t.points) p.age += dtMs;
        t.points = t.points.filter((p) => p.age < DUREE);
        if (t.points.length === 0) {
          traces.delete(cle);
          continue;
        }
        for (let i = 1; i < t.points.length; i++) {
          const a = t.points[i - 1];
          const b = t.points[i];
          const la = t.largeur * (1 - a.age / DUREE);
          const lb = t.largeur * (1 - b.age / DUREE);
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const n = Math.hypot(dx, dy) || 1;
          const nx = -dy / n;
          const ny = dx / n;
          graphics
            .poly([a.x + nx * la, a.y + ny * la, b.x + nx * lb, b.y + ny * lb, b.x - nx * lb, b.y - ny * lb, a.x - nx * la, a.y - ny * la])
            .fill({ color: t.couleur, alpha: 0.55 * (1 - b.age / DUREE) });
        }
      }
    },
  };
}
