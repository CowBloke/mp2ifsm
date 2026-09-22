import { Container, Sprite, Texture } from "pixi.js";

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
  /** Poussière (atterrissage, dash). */
  poussiere(x: number, y: number, nombre: number): void;
  secousse(amplitude: number): void;
  /** Décalage de caméra dû à la secousse, pour cette image. */
  decalage(): { x: number; y: number };
  maj(dtMs: number): void;
};

export function creerEffets(couche: Container): Effets {
  const actives: Particule[] = [];
  const libres: Sprite[] = [];
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
    poussiere(x, y, nombre) {
      for (let i = 0; i < nombre; i++) {
        const angle = Math.PI + Math.random() * Math.PI;
        emettre(x + (Math.random() - 0.5) * 30, y, Math.cos(angle) * 0.18, Math.sin(angle) * 0.06,
          260 + Math.random() * 200, 5 + Math.random() * 6, 0x9aa3c7, -0.00005);
      }
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
