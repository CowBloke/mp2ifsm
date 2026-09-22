import type { Graphics } from "pixi.js";
import type { Apparence, Palette } from "./types";

/*
 * Le mannequin d'entraînement : une poupée de toile recousue, une cible
 * peinte sur le torse. Ses coups n'ont pas d'animation dédiée : le bras
 * vise simplement la hitbox (animation de repli de l'animateur).
 */

const CONTOUR = 3;

const PALETTES: Palette[] = [
  { toile: 0xcdb892, ombre: 0xa8936d, couture: 0x6b5a3e, cible: 0xd8433c, contour: 0x0b0d14 },
  { toile: 0x9fb3c8, ombre: 0x7d91a6, couture: 0x4a5a6b, cible: 0xf2b31b, contour: 0x0b0d14 },
];

function buste(g: Graphics, p: Palette) {
  g.roundRect(-20, -47, 40, 52, 14).fill(p.toile).stroke({ width: CONTOUR, color: p.contour });
  g.circle(4, -24, 11).fill(0xf6f1e7).stroke({ width: 2, color: p.cible });
  g.circle(4, -24, 6).fill(p.cible);
  g.moveTo(-14, -8).lineTo(14, -8).stroke({ width: 2, color: p.couture, alpha: 0.7 });
}

function tete(g: Graphics, p: Palette) {
  g.rect(-5, -8, 11, 10).fill(p.ombre).stroke({ width: CONTOUR, color: p.contour });
  g.circle(1, -21, 14).fill(p.toile).stroke({ width: CONTOUR, color: p.contour });
  // Yeux cousus en croix.
  for (const [x, y] of [[7, -23], [13, -22]]) {
    g.moveTo(x - 2, y - 2).lineTo(x + 2, y + 2).moveTo(x + 2, y - 2).lineTo(x - 2, y + 2)
      .stroke({ width: 1.8, color: p.couture });
  }
  g.moveTo(-6, -32).quadraticCurveTo(0, -36, 8, -33).stroke({ width: 2, color: p.couture, alpha: 0.7 });
}

function membre(longueur: number, epaisseur: number) {
  return (g: Graphics, p: Palette) => {
    g.roundRect(-epaisseur / 2, -4, epaisseur, longueur + 8, epaisseur / 2).fill(p.toile).stroke({ width: CONTOUR, color: p.contour });
    g.moveTo(0, 2).lineTo(0, longueur).stroke({ width: 1.5, color: p.couture, alpha: 0.5 });
  };
}

export const APPARENCE_MANNEQUIN: Apparence = {
  id: "mannequin",
  etincelles: 0xf6f1e7,
  proportions: {
    hanche: 44, torse: 44, cou: 4, rayonTete: 14,
    epauleAv: [7, 38], epauleAr: [-7, 38], hancheAv: 6, hancheAr: -6,
    bras: [24, 24], jambe: [24, 22], pied: 12,
  },
  palettes: PALETTES,
  dessins: {
    buste,
    tete,
    bras: membre(24, 13),
    avantBras: (g, p) => {
      membre(22, 11)(g, p);
      g.circle(0, 26, 8).fill(p.toile).stroke({ width: CONTOUR, color: p.contour });
    },
    cuisse: membre(24, 15),
    tibia: (g, p) => {
      membre(20, 13)(g, p);
      g.roundRect(-7, 18, 20, 9, 4).fill(p.ombre).stroke({ width: CONTOUR, color: p.contour });
    },
  },
  poses: {
    garde: { torse: 4, brasAv: [25, 60], brasAr: [15, 60], jambeAv: [12, -10], jambeAr: [-10, -8] },
    saut: { brasAv: [70, 40], brasAr: [60, 40], jambeAv: [45, -80], jambeAr: [15, -70] },
    chute: { brasAv: [130, 20], brasAr: [120, 20], jambeAv: [15, -20], jambeAr: [-10, -15] },
    dash: { torse: 30, brasAv: [-30, 30], brasAr: [-40, 30], jambeAv: [45, -30], jambeAr: [-40, -20] },
    touche: { bassin: [-5, 2, -8], torse: -30, tete: -25, brasAv: [80, 20], brasAr: [120, 20], jambeAv: [30, -30], jambeAr: [-10, -30] },
    ko: { rotation: -90, decalage: [0, 46], torse: -6, brasAv: [150, 0], brasAr: [165, 0] },
    atterrissage: { bassin: [0, 12, 0], torse: 14, jambeAv: [40, -80], jambeAr: [-20, -70] },
    victoire: { brasAv: [170, 0], brasAr: [165, 0], tete: -10 },
  },
  animations: {},
  effets: {},
};
