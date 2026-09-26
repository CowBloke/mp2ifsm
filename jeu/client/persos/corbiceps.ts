import type { Graphics } from "pixi.js";
import type { Apparence, Cle, Palette } from "./types";

/*
 * Mr Corbiceps, en vecteurs : crâne dégarni, biceps démesurés, maillot
 * cerclé rouge et noir de rugbyman (sans aucun logo réel : un simple
 * écusson Σ), craie sur les poings. Les couleurs changent quand deux
 * Corbiceps s'affrontent.
 */

const CONTOUR = 3;

const PALETTES: Palette[] = [
  { peau: 0xf0c3a0, ombre: 0xcf9b77, maillot1: 0xd21f2c, maillot2: 0x17181d, short: 0x17181d, chaussure: 0x0f1014, cheveux: 0x6d635b, contour: 0x0b0d14, ecusson: 0xf6f1e7 },
  { peau: 0xf0c3a0, ombre: 0xcf9b77, maillot1: 0x2563d6, maillot2: 0xf1f3f7, short: 0xf1f3f7, chaussure: 0x0f1014, cheveux: 0x6d635b, contour: 0x0b0d14, ecusson: 0xf6c343 },
  { peau: 0xdba27a, ombre: 0xb57d58, maillot1: 0x18a058, maillot2: 0x17181d, short: 0x17181d, chaussure: 0x0f1014, cheveux: 0x3a2f28, contour: 0x0b0d14, ecusson: 0xf6f1e7 },
  { peau: 0xf0c3a0, ombre: 0xcf9b77, maillot1: 0xf0b21a, maillot2: 0x17181d, short: 0x17181d, chaussure: 0x0f1014, cheveux: 0x9b8f84, contour: 0x0b0d14, ecusson: 0x17181d },
];

/** Contour du buste (depuis les hanches, vers le haut) : large carrure, taille marquée. */
const BUSTE: [number, number][] = [
  [-17, 5], [-22, -12], [-34, -32], [-33, -44], [-24, -50], [-11, -54], [11, -54], [24, -50], [34, -44], [36, -32], [23, -12], [18, 5],
];

/** Abscisses gauche et droite du buste à la hauteur y (interpolation du contour). */
function largeurA(y: number): [number, number] {
  const cote = (points: [number, number][]) => {
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      if ((y <= y0 && y >= y1) || (y >= y0 && y <= y1)) {
        const t = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
        return x0 + (x1 - x0) * t;
      }
    }
    return points[points.length - 1][0];
  };
  return [cote(BUSTE.slice(0, 7)), cote(BUSTE.slice(6).reverse())];
}

function bande(g: Graphics, haut: number, bas: number, couleur: number) {
  const [g1, d1] = largeurA(haut);
  const [g2, d2] = largeurA(bas);
  g.poly([g1, haut, d1, haut, d2, bas, g2, bas]).fill(couleur);
}

function buste(g: Graphics, p: Palette) {
  g.poly(BUSTE.flat()).fill(p.maillot1);
  // Cerceaux du maillot.
  for (const [h, b] of [[-54, -45], [-37, -29], [-21, -14], [-7, 0]] as const) bande(g, h, b, p.maillot2);
  // Short.
  bande(g, 0, 5, p.short);
  // Col blanc.
  g.poly([-9, -54, 0, -45, 9, -54]).fill(0xf4f1ea).stroke({ width: 2, color: p.contour });
  // Relief : pectoraux et abdominaux, discrets.
  g.moveTo(-2, -40).bezierCurveTo(10, -35, 22, -35, 31, -40).stroke({ width: 2, color: 0x000000, alpha: 0.3 });
  g.moveTo(3, -32).lineTo(3, -6).stroke({ width: 2, color: 0x000000, alpha: 0.2 });
  // Écusson Σ.
  g.roundRect(9, -30, 12, 13, 3).fill(p.ecusson).stroke({ width: 1.5, color: p.contour });
  g.moveTo(18.5, -27.5).lineTo(11.5, -27.5).lineTo(15.5, -23.5).lineTo(11.5, -19.5).lineTo(18.5, -19.5)
    .stroke({ width: 1.6, color: p.maillot1 === 0xf0b21a ? 0xf0b21a : 0x17181d });
  g.poly(BUSTE.flat()).stroke({ width: CONTOUR, color: p.contour });
}

function tete(g: Graphics, p: Palette) {
  // Cou épais.
  g.poly([-8, 3, 9, 3, 8, -9, -7, -9]).fill(p.peau).stroke({ width: CONTOUR, color: p.contour });
  // Crâne et mâchoire carrée.
  g.circle(2, -20, 15).fill(p.peau);
  g.roundRect(-9, -20, 24, 16, 7).fill(p.peau);
  g.circle(2, -20, 15).stroke({ width: CONTOUR, color: p.contour });
  g.moveTo(-9, -12).quadraticCurveTo(-8, -3, 4, -4).quadraticCurveTo(15, -4, 16, -12)
    .stroke({ width: CONTOUR, color: p.contour });
  // Couronne de cheveux : à l'arrière et sur les côtés seulement.
  g.poly([-13, -29, -16, -20, -14, -11, -8, -8, -9, -16, -10, -24, -6, -31]).fill(p.cheveux);
  g.poly([5, -34, 9, -35, 8, -32]).fill(p.cheveux);
  // Reflet du crâne.
  g.ellipse(3, -30, 8, 3.5).fill({ color: 0xffffff, alpha: 0.45 });
  // Oreille, sourcil froncé, œil, nez, bouche, barbe naissante.
  g.ellipse(-4, -18, 3.2, 5).fill(p.peau);
  g.moveTo(-5.5, -22).quadraticCurveTo(-1.5, -18, -5, -14).stroke({ width: 1.6, color: p.ombre });
  g.moveTo(6, -25).lineTo(15, -22.5).stroke({ width: 3.2, color: p.cheveux, cap: "round" });
  g.circle(12, -19.5, 1.9).fill(p.contour);
  g.poly([15.5, -20, 19.5, -14.5, 15, -13.5]).fill(p.peau).stroke({ width: 1.6, color: p.contour });
  g.moveTo(10.5, -9.5).lineTo(15.5, -10.5).stroke({ width: 2, color: p.contour, cap: "round" });
  g.ellipse(7, -8, 9, 4).fill({ color: p.cheveux, alpha: 0.22 });
}

function bras(g: Graphics, p: Palette) {
  // Biceps démesuré (avec son pic), triceps, reflet, puis deltoïde sous la manche.
  g.ellipse(0, 14, 15, 17).fill(p.peau).stroke({ width: CONTOUR, color: p.contour });
  g.ellipse(7, 12, 10, 11).fill(p.peau).stroke({ width: CONTOUR, color: p.contour });
  g.ellipse(0, 14, 13.5, 15.5).fill(p.peau);
  g.ellipse(7, 12, 8.5, 9.5).fill(p.peau);
  g.ellipse(8, 9, 4, 5.5).fill({ color: 0xffffff, alpha: 0.28 });
  g.moveTo(-8, 21).quadraticCurveTo(0, 28, 9, 22).stroke({ width: 1.8, color: 0x000000, alpha: 0.28 });
  g.roundRect(-16, -9, 32, 16, 8).fill(p.maillot1).stroke({ width: CONTOUR, color: p.contour });
  g.rect(-14.5, -2, 29, 4.5).fill(p.maillot2);
}

function avantBras(g: Graphics, p: Palette) {
  g.poly([-10, -3, 10, -3, 8, 22, -8, 22]).fill(p.peau).stroke({ width: CONTOUR, color: p.contour });
  g.moveTo(4, 2).quadraticCurveTo(6, 10, 3, 17).stroke({ width: 1.6, color: 0x000000, alpha: 0.22 });
  // Poing, jointures, craie.
  g.circle(0, 27, 11.5).fill(p.peau).stroke({ width: CONTOUR, color: p.contour });
  g.moveTo(5, 22).quadraticCurveTo(9, 27, 5, 32).stroke({ width: 1.6, color: p.contour, alpha: 0.6 });
  for (const [x, y] of [[-3, 30], [2, 33], [4, 25], [-5, 25]]) g.circle(x, y, 1.3).fill({ color: 0xffffff, alpha: 0.7 });
}

function cuisse(g: Graphics, p: Palette) {
  g.roundRect(-12, 9, 24, 20, 9).fill(p.peau).stroke({ width: CONTOUR, color: p.contour });
  g.roundRect(-14, -8, 28, 24, 10).fill(p.short).stroke({ width: CONTOUR, color: p.contour });
}

function tibia(g: Graphics, p: Palette) {
  g.roundRect(-8, -3, 16, 23, 6).fill(p.maillot1).stroke({ width: CONTOUR, color: p.contour });
  g.rect(-6.5, 5, 13, 5).fill(p.maillot2);
  // Crampons.
  g.poly([-9, 16, 7, 16, 21, 21, 21, 28, -9, 28]).fill(p.chaussure).stroke({ width: CONTOUR, color: p.contour });
  g.rect(-5, 28, 4, 3).fill(p.chaussure);
  g.rect(9, 28, 4, 3).fill(p.chaussure);
}

function ballon(g: Graphics) {
  g.ellipse(6, 4, 14, 9).fill(0xf6f3ee).stroke({ width: CONTOUR, color: 0x0b0d14 });
  g.moveTo(-2, -2).quadraticCurveTo(6, 4, -2, 10).stroke({ width: 2.4, color: 0xd21f2c });
  g.moveTo(14, -2).quadraticCurveTo(6, 4, 14, 10).stroke({ width: 2.4, color: 0xd21f2c });
}

/** Série de l'ultime : un coup de poing par terme de Fibonacci, bras alternés, puis le marteau final. */
function serieDivergente(): Cle[] {
  const cles: Cle[] = [{ f: 0, p: { torse: 10 } }];
  [10, 22, 34, 46, 58].forEach((h, i) => {
    const avant = i % 2 === 0;
    cles.push({ f: h - 4, p: avant ? { brasAv: [-30, 120], brasAr: [40, 100], torse: -6 } : { brasAr: [-30, 120], brasAv: [40, 100], torse: -6 } });
    cles.push({ f: h, p: avant
      ? { brasAv: [95, 2], brasAr: [20, 110], torse: 24, bassin: [8, 4, 0] }
      : { brasAr: [98, 2], brasAv: [25, 110], torse: 28, bassin: [8, 4, 4] } });
  });
  cles.push({ f: 72, p: { bassin: [-4, 10, 0], torse: -18, tete: -14, brasAv: [165, 30], brasAr: [170, 25], echelle: [0.96, 1.06] } });
  cles.push({ f: 80, p: { bassin: [12, 6, 0], torse: 40, brasAv: [100, 0], brasAr: [96, 0], echelle: [1.06, 0.95] } });
  cles.push({ f: 92, p: { bassin: [10, 6, 0], torse: 36, brasAv: [96, 4], brasAr: [92, 4] } });
  cles.push({ f: 110, p: {} });
  return cles;
}

/** Course de l'essai : jambes alternées pendant l'élan. */
function courseEssai(): Cle[] {
  const cles: Cle[] = [{ f: 0, p: {} }, { f: 8, p: { torse: 44, bassin: [0, 6, 0], brasAv: [55, 110], brasAr: [35, 100] } }];
  for (let f = 12, pas = 0; f <= 40; f += 5, pas++) {
    const g = pas % 2 === 0;
    cles.push({ f, p: {
      torse: 46, tete: -30, bassin: [0, g ? 4 : 8, 0], brasAv: [55, 110], brasAr: [g ? 60 : 10, 90],
      jambeAv: g ? [55, -40] : [-35, -60], jambeAr: g ? [-35, -60] : [55, -40],
    } });
  }
  cles.push({ f: 48, p: { torse: 20 } }, { f: 56, p: {} });
  return cles;
}

export const APPARENCE_CORBICEPS: Apparence = {
  id: "corbiceps",
  etincelles: 0xff4d5a,
  proportions: {
    hanche: 50,
    torse: 47,
    cou: 5,
    rayonTete: 15,
    epauleAv: [11, 42],
    epauleAr: [-11, 42],
    hancheAv: 7,
    hancheAr: -7,
    bras: [26, 25],
    jambe: [26, 24],
    pied: 18,
  },
  palettes: PALETTES,
  dessins: { buste, tete, bras, avantBras, cuisse, tibia, accessoires: { ballon } },
  poses: {
    garde: { bassin: [0, 4, 0], torse: 8, tete: -6, brasAv: [35, 105], brasAr: [18, 112], jambeAv: [22, -28], jambeAr: [-18, -22] },
    saut: { bassin: [0, -2, 0], torse: -4, tete: -4, brasAv: [60, 70], brasAr: [40, 80], jambeAv: [55, -95], jambeAr: [15, -80] },
    chute: { torse: 6, brasAv: [120, 30], brasAr: [105, 40], jambeAv: [20, -30], jambeAr: [-10, -20] },
    dash: { bassin: [4, 8, 0], torse: 38, tete: -20, brasAv: [-35, 40], brasAr: [-45, 45], jambeAv: [55, -40], jambeAr: [-45, -30] },
    touche: { bassin: [-6, 2, -8], torse: -28, tete: -22, brasAv: [70, 20], brasAr: [110, 30], jambeAv: [30, -30], jambeAr: [-10, -30] },
    ko: { rotation: -90, decalage: [0, 52], torse: -8, tete: -12, brasAv: [150, 10], brasAr: [165, 10], jambeAv: [12, -12], jambeAr: [-4, -6] },
    atterrissage: { bassin: [0, 16, 0], torse: 18, brasAv: [30, 90], brasAr: [15, 100], jambeAv: [45, -85], jambeAr: [-25, -75] },
    // Double biceps : forcément.
    victoire: { bassin: [0, 2, 0], torse: -4, tete: -10, brasAv: [92, 150], brasAr: [96, 150], jambeAv: [18, -10], jambeAr: [-18, -8] },
  },
  animations: {
    neutre: [
      { f: 0, p: {} }, { f: 3, p: { brasAv: [20, 130], torse: 4 } },
      { f: 5, p: { brasAv: [92, 4], torse: 16, bassin: [6, 4, 0] } }, { f: 8, p: { brasAv: [88, 10], torse: 14, bassin: [5, 4, 0] } },
      { f: 13, p: { brasAv: [40, 95] } }, { f: 18, p: {} },
    ],
    neutre2: [
      { f: 0, p: {} }, { f: 3, p: { brasAr: [10, 130], torse: 0 } },
      { f: 5, p: { brasAr: [95, 4], brasAv: [20, 120], torse: 22, bassin: [8, 4, 4] } }, { f: 8, p: { brasAr: [90, 8], torse: 20, bassin: [7, 4, 4] } },
      { f: 13, p: { brasAr: [25, 105] } }, { f: 18, p: {} },
    ],
    neutre3: [
      { f: 0, p: {} }, { f: 3, p: { brasAv: [60, 140], torse: -4 } },
      { f: 6, p: { brasAv: [100, 45], torse: 18, bassin: [6, 4, 6] } }, { f: 9, p: { brasAv: [95, 50], torse: 16 } },
      { f: 15, p: { brasAv: [40, 100] } }, { f: 20, p: {} },
    ],
    neutre4: [
      { f: 0, p: {} },
      { f: 6, p: { bassin: [-4, 12, 0], torse: -14, tete: -10, brasAv: [150, 40], brasAr: [160, 30], jambeAv: [30, -50], jambeAr: [-25, -45] } },
      { f: 10, p: { bassin: [10, 2, 0], torse: 32, brasAv: [105, -5], brasAr: [100, 0], jambeAv: [35, -10], jambeAr: [-30, -10], echelle: [1.05, 0.96] } },
      { f: 15, p: { bassin: [10, 4, 0], torse: 30, brasAv: [95, 5], brasAr: [92, 5] } },
      { f: 26, p: { torse: 12, brasAv: [45, 90], brasAr: [25, 100] } }, { f: 34, p: {} },
    ],
    cote: [
      { f: 0, p: {} },
      { f: 6, p: { bassin: [-6, 14, 0], torse: 40, tete: -25, brasAv: [60, 110], brasAr: [40, 110], jambeAv: [45, -70], jambeAr: [-30, -40] } },
      { f: 10, p: { bassin: [8, 10, 0], torse: 62, tete: -45, brasAv: [80, 120], brasAr: [70, 120], jambeAv: [40, -30], jambeAr: [-55, -10] } },
      { f: 18, p: { bassin: [8, 10, 0], torse: 60, tete: -40, brasAv: [85, 115], brasAr: [75, 115], jambeAv: [-20, -50], jambeAr: [50, -40] } },
      { f: 30, p: { torse: 25, bassin: [0, 8, 0] } }, { f: 40, p: {} },
    ],
    haut: [
      { f: 0, p: {} },
      { f: 5, p: { bassin: [0, 16, 0], torse: 14, brasAv: [-10, 135], jambeAv: [40, -70], jambeAr: [-20, -60] } },
      { f: 8, p: { bassin: [4, -4, 0], torse: -12, tete: -20, brasAv: [172, 8], brasAr: [30, 90], jambeAv: [15, -10], jambeAr: [-10, -5], echelle: [0.95, 1.06] } },
      { f: 13, p: { bassin: [4, -2, 0], torse: -10, brasAv: [168, 15] } },
      { f: 24, p: { brasAv: [60, 90], torse: 4 } }, { f: 34, p: {} },
    ],
    bas: [
      { f: 0, p: {} },
      { f: 8, p: { bassin: [0, -6, -4], torse: -6, brasAv: [120, 60], brasAr: [110, 70], jambeAv: [85, -20], jambeAr: [-5, -10] } },
      { f: 12, p: { bassin: [4, 14, 4], torse: 28, tete: -10, brasAv: [20, 40], brasAr: [10, 40], jambeAv: [30, -60], jambeAr: [-35, -40], echelle: [1.06, 0.94] } },
      { f: 16, p: { bassin: [4, 14, 4], torse: 26, brasAv: [25, 45] } },
      { f: 28, p: { bassin: [0, 6, 0], torse: 10 } }, { f: 38, p: {} },
    ],
    air_neutre: [
      { f: 0, p: { brasAv: [60, 40], brasAr: [60, 40] } },
      { f: 5, p: { brasAv: [95, 0], brasAr: [95, 0], rotation: 0 } },
      { f: 16, p: { brasAv: [95, 0], brasAr: [95, 0], rotation: 360 } },
      { f: 24, p: { brasAv: [60, 60], brasAr: [40, 60], rotation: 360 } }, { f: 32, p: { rotation: 360 } },
    ],
    air_cote: [
      { f: 0, p: {} }, { f: 5, p: { brasAv: [30, 130], torse: 10 } },
      { f: 8, p: { brasAv: [92, 0], torse: 28, jambeAv: [30, -60], jambeAr: [-20, -40] } },
      { f: 12, p: { brasAv: [88, 6], torse: 25 } }, { f: 22, p: { brasAv: [50, 80] } }, { f: 30, p: {} },
    ],
    air_haut: [
      { f: 0, p: {} }, { f: 4, p: { torse: 20, tete: 10, brasAv: [-20, 40], brasAr: [-30, 40] } },
      { f: 6, p: { torse: -30, tete: -35, brasAv: [-40, 20], brasAr: [-50, 20], echelle: [0.94, 1.08] } },
      { f: 11, p: { torse: -25, tete: -30 } }, { f: 20, p: { torse: 0 } }, { f: 28, p: {} },
    ],
    air_bas: [
      { f: 0, p: {} },
      { f: 6, p: { jambeAv: [70, -110], jambeAr: [60, -110], brasAv: [140, 40], brasAr: [150, 30], torse: -8 } },
      { f: 10, p: { jambeAv: [5, 0], jambeAr: [-5, 0], brasAv: [170, 10], brasAr: [165, 10], torse: -4, echelle: [0.92, 1.1] } },
      { f: 20, p: { jambeAv: [5, 0], jambeAr: [-5, 0], brasAv: [165, 15], brasAr: [160, 15] } },
      { f: 30, p: { jambeAv: [30, -40], jambeAr: [-20, -30] } }, { f: 36, p: {} },
    ],
    special_neutre: [
      { f: 0, p: {} },
      { f: 8, p: { bassin: [-8, 8, 0], torse: -18, tete: -8, brasAv: [-70, 120], brasAr: [40, 110], jambeAv: [30, -40], jambeAr: [-35, -20] } },
      { f: 13, p: { bassin: [16, 4, 0], torse: 28, tete: -4, brasAv: [96, 0], brasAr: [-20, 60], jambeAv: [40, -15], jambeAr: [-45, -5], echelle: [1.06, 0.95] } },
      { f: 17, p: { bassin: [16, 4, 0], torse: 26, brasAv: [94, 4] } },
      { f: 34, p: { torse: 10, brasAv: [45, 90] } }, { f: 46, p: {} },
    ],
    special_cote: courseEssai(),
    special_haut: [
      { f: 0, p: { bassin: [0, 12, 0], jambeAv: [40, -80], jambeAr: [-20, -70], brasAv: [20, 60], brasAr: [10, 60] } },
      { f: 4, p: { brasAv: [175, 0], brasAr: [170, 0], jambeAv: [5, -5], jambeAr: [-5, -5], echelle: [0.9, 1.12], torse: -4 } },
      { f: 18, p: { brasAv: [170, 5], brasAr: [165, 5], echelle: [0.95, 1.05] } },
      { f: 30, p: { brasAv: [120, 40], brasAr: [110, 40], jambeAv: [30, -50] } }, { f: 44, p: {} },
    ],
    special_bas: [
      { f: 0, p: {} }, { f: 3, p: { brasAv: [80, 120], brasAr: [75, 125], torse: -6, tete: 4, bassin: [-4, 6, 0] } },
      { f: 22, p: { brasAv: [80, 120], brasAr: [75, 125], torse: -6, bassin: [-4, 6, 0] } }, { f: 32, p: {} }, { f: 44, p: {} },
    ],
    riposte: [
      { f: 0, p: { brasAv: [-40, 110], torse: -10 } },
      { f: 4, p: { brasAv: [95, 0], torse: 30, bassin: [14, 4, 0], echelle: [1.05, 0.96] } },
      { f: 8, p: { brasAv: [92, 4], torse: 28 } }, { f: 20, p: { brasAv: [40, 90], torse: 10 } }, { f: 30, p: {} },
    ],
    ultime: [
      { f: 0, p: {} },
      { f: 5, p: { bassin: [-6, 14, 0], torse: 20, brasAv: [-40, 90], brasAr: [-50, 90], jambeAv: [40, -80], jambeAr: [-30, -70] } },
      { f: 8, p: { bassin: [8, -4, 0], torse: 40, brasAv: [100, 10], brasAr: [95, 15], jambeAv: [-10, -20], jambeAr: [-40, -20] } },
      { f: 18, p: { torse: 35, brasAv: [95, 15], brasAr: [90, 20] } }, { f: 40, p: {} },
    ],
    ultime_serie: serieDivergente(),
  },
  effets: {
    neutre: { trainee: ["poingAv"], textes: [{ f: 5, texte: "oui", membre: "poingAv", taille: 24 }] },
    neutre2: { trainee: ["poingAr"], textes: [{ f: 5, texte: "non", membre: "poingAr", taille: 24 }] },
    neutre3: { trainee: ["poingAv"], textes: [{ f: 6, texte: "non", membre: "poingAv", taille: 24 }] },
    neutre4: { trainee: ["poingAv", "poingAr"], couleurTrainee: 0xffd166, textes: [{ f: 10, texte: "OUI !", membre: "poingAv", taille: 34, couleur: 0xffd166 }] },
    cote: { trainee: ["torse"], couleurTrainee: 0xff4d5a },
    haut: { trainee: ["poingAv"], couleurTrainee: 0xffd166, textes: [{ f: 8, texte: "Σ", membre: "poingAv", taille: 46, couleur: 0xffd166, math: true }] },
    bas: { onde: 12, textes: [{ f: 12, texte: "∇", membre: "piedAv", taille: 36, math: true }] },
    air_neutre: { trainee: ["poingAv", "poingAr"], textes: [{ f: 6, texte: "2π", membre: "torse", taille: 30, math: true }] },
    air_cote: { trainee: ["poingAv"], textes: [{ f: 8, texte: "×", membre: "poingAv", taille: 40, math: true }] },
    air_haut: { trainee: ["tete"], textes: [{ f: 6, texte: "n+1", membre: "tete", taille: 28, math: true }] },
    air_bas: { trainee: ["piedAv", "piedAr"], textes: [{ f: 10, texte: "∫", membre: "piedAv", taille: 46, math: true }] },
    special_neutre: { trainee: ["poingAv"], couleurTrainee: 0xffd166, textes: [{ f: 13, texte: "∏", membre: "poingAv", taille: 48, couleur: 0xffd166, math: true }] },
    special_cote: { accessoire: "ballon", trainee: ["torse"], textesTouche: ["Essai !"] },
    special_haut: { trainee: ["poingAv", "poingAr"], textes: [{ f: 5, texte: "n → n+1", membre: "tete", taille: 26, math: true }] },
    special_bas: { texteContre: "NON." },
    riposte: { trainee: ["poingAv"], couleurTrainee: 0xff4d5a },
    ultime: { textes: [{ f: 5, texte: "Σ 1/n", membre: "tete", taille: 34, couleur: 0xffd166, math: true }] },
    ultime_serie: {
      trainee: ["poingAv", "poingAr"], couleurTrainee: 0xffd166, embleme: "Σ",
      textesTouche: ["1", "1", "2", "3", "5", "+∞"],
    },
  },
};
