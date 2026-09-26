import { Container, Graphics, Sprite, Texture } from "pixi.js";

/*
 * Effets d'impact : étincelles et secousse de caméra.
 *
 * Purement visuel : rien ici ne touche à la simulation. Les particules
 * sont recyclées (aucune allocation une fois le pool rempli).
 */

const MAX_PARTICULES = 320;

type Particule = {
  sprite: Sprite;
  vx: number;
  vy: number;
  vie: number;
  duree: number;
  taille: number;
  gravite: number;
};

export type Effets = {
  /** Gerbe d'étincelles au point d'impact, orientée dans le sens du coup. */
  etincelles(x: number, y: number, sens: number, force: number, couleur: number): void;
  /** Poussière (atterrissage, dash) ; blanche, c'est de la craie. */
  poussiere(x: number, y: number, nombre: number, couleur?: number): void;
  /** Onde de choc au sol : un anneau aplati qui s'élargit. */
  onde(x: number, y: number, couleur: number, rayon: number): void;
  secousse(amplitude: number): void;
  /** Décalage de caméra dû à la secousse, pour cette image. */
  decalage(): { x: number; y: number };
  maj(dtMs: number): void;
};

type Onde = { x: number; y: number; couleur: number; rayon: number; vie: number };
const DUREE_ONDE = 380;

export function creerEffets(couche: Container): Effets {
  const actives: Particule[] = [];
  const libres: Sprite[] = [];
  const ondes: Onde[] = [];
  const anneaux = couche.addChild(new Graphics());
  let amplitude = 0;

  function emettre(x: number, y: number, vx: number, vy: number, duree: number, taille: number, couleur: number, gravite: number) {
    if (actives.length >= MAX_PARTICULES) return;
    const sprite = libres.pop() ?? couche.addChild(new Sprite(Texture.WHITE));
    sprite.visible = true;
    sprite.anchor.set(0.5);
    sprite.position.set(x, y);
    sprite.tint = couleur;
    sprite.alpha = 1;
    actives.push({ sprite, vx, vy, vie: duree, duree, taille, gravite });
  }

  return {
    etincelles(x, y, sens, force, couleur) {
      const n = Math.min(18, 6 + Math.round(force / 12));
      for (let i = 0; i < n; i++) {
        const angle = (Math.random() - 0.5) * 1.4 + (sens >= 0 ? 0 : Math.PI);
        const v = 0.35 + Math.random() * (0.4 + force / 250);
        emettre(x, y, Math.cos(angle) * v, Math.sin(angle) * v - 0.15, 180 + Math.random() * 160,
          3 + Math.random() * 4, i % 3 === 0 ? 0xffffff : couleur, 0.0012);
      }
    },
    poussiere(x, y, nombre, couleur = 0x9aa3c7) {
      for (let i = 0; i < nombre; i++) {
        const angle = Math.PI + Math.random() * Math.PI;
        emettre(x + (Math.random() - 0.5) * 30, y, Math.cos(angle) * 0.18, Math.sin(angle) * 0.06,
          260 + Math.random() * 200, 5 + Math.random() * 6, couleur, -0.00005);
      }
    },
    onde(x, y, couleur, rayon) {
      ondes.push({ x, y, couleur, rayon, vie: DUREE_ONDE });
    },
    secousse(a) {
      amplitude = Math.min(24, Math.max(amplitude, a));
    },
    decalage() {
      if (amplitude < 0.3) return { x: 0, y: 0 };
      return { x: (Math.random() - 0.5) * 2 * amplitude, y: (Math.random() - 0.5) * 2 * amplitude };
    },
    maj(dtMs) {
      amplitude *= Math.exp(-dtMs / 70);
      anneaux.clear();
      for (let i = ondes.length - 1; i >= 0; i--) {
        const o = ondes[i];
        o.vie -= dtMs;
        if (o.vie <= 0) {
          ondes.splice(i, 1);
          continue;
        }
        const t = 1 - o.vie / DUREE_ONDE;
        const r = o.rayon * (0.25 + 0.75 * (1 - (1 - t) ** 2));
        anneaux.ellipse(o.x, o.y, r, r * 0.22).stroke({ width: 6 * (1 - t) + 1, color: o.couleur, alpha: 0.85 * (1 - t) });
      }
      for (let i = actives.length - 1; i >= 0; i--) {
        const p = actives[i];
        p.vie -= dtMs;
        if (p.vie <= 0) {
          p.sprite.visible = false;
          libres.push(p.sprite);
          actives.splice(i, 1);
          continue;
        }
        p.vy += p.gravite * dtMs;
        p.sprite.x += p.vx * dtMs;
        p.sprite.y += p.vy * dtMs;
        const t = p.vie / p.duree;
        p.sprite.alpha = t;
        p.sprite.width = p.sprite.height = p.taille * (0.4 + 0.6 * t);
        p.sprite.rotation = Math.atan2(p.vy, p.vx);
      }
    },
  };
}
