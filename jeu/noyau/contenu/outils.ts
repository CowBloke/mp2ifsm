import { px } from "../constantes";
import type { HitboxDef, MouvementDef } from "../definitions";

/*
 * Aides d'écriture du contenu : on décrit les coups en pixels et en
 * pixels par tick, lisibles ; ces fonctions convertissent en unités.
 */

type FrappePx = Omit<HitboxDef, "croissance"> & { croissance?: number };

/** Hitbox décrite en pixels (position, taille, recul, croissance). */
export function frappe(h: FrappePx): HitboxDef {
  return {
    ...h,
    x: px(h.x),
    y: px(h.y),
    l: px(h.l),
    h: px(h.h),
    recul: px(h.recul),
    croissance: px(h.croissance ?? 0),
  };
}

/** Mouvement imposé, vitesses en pixels par tick. */
export function elan(de: number, a: number, v: { vx?: number; vy?: number; gravite?: number }): MouvementDef {
  return {
    de,
    a,
    ...(v.vx !== undefined ? { vx: px(v.vx) } : {}),
    ...(v.vy !== undefined ? { vy: px(v.vy) } : {}),
    ...(v.gravite !== undefined ? { gravite: v.gravite } : {}),
  };
}
