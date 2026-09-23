import { Container, Graphics, Text } from "pixi.js";
import type { Apparence, DessinEntite, Palette } from "./types";

/*
 * Souheil Dictador, en vecteurs : maillot de footballeur, gants blancs de
 * général d'opérette, casquette d'officier galonnée, lunettes d'aviateur,
 * médailles en chocolat. Une caricature de classe, dorée sur tranche.
 */

const CONTOUR = 3;

const PALETTES: Palette[] = [
  { peau: 0xc98e62, ombre: 0xa8744d, maillot: 0x1f4fbf, liseret: 0xf5f7fa, short: 0xf5f7fa, chaussette: 0x1f4fbf, crampon: 0x111318, casquette: 0x2f3b2a, galon: 0xf2c14e, cheveux: 0x1b1410, verre: 0x1a1f2b, gant: 0xf7f7f7, contour: 0x0b0d14 },
  { peau: 0xc98e62, ombre: 0xa8744d, maillot: 0xd6243a, liseret: 0x111318, short: 0x111318, chaussette: 0xd6243a, crampon: 0x111318, casquette: 0x2a2a30, galon: 0xf2c14e, cheveux: 0x1b1410, verre: 0x1a1f2b, gant: 0xf7f7f7, contour: 0x0b0d14 },
  { peau: 0xb07a52, ombre: 0x8f5f3c, maillot: 0xf5f7fa, liseret: 0x1f4fbf, short: 0x1f4fbf, chaussette: 0xf5f7fa, crampon: 0x111318, casquette: 0x3b2f2a, galon: 0xf2c14e, cheveux: 0x120d0a, verre: 0x1a1f2b, gant: 0xf7f7f7, contour: 0x0b0d14 },
  { peau: 0xd9a176, ombre: 0xb8845c, maillot: 0x15925a, liseret: 0xf2c14e, short: 0x0f4d31, chaussette: 0x15925a, crampon: 0x111318, casquette: 0x2f3b2a, galon: 0xf2c14e, cheveux: 0x1b1410, verre: 0x1a1f2b, gant: 0xf7f7f7, contour: 0x0b0d14 },
];

const MAILLOT: number[] = [-16, 4, -19, -14, -24, -34, -20, -44, -9, -46, 9, -46, 20, -44, 24, -34, 19, -14, 16, 4];

function etoile(g: Graphics, x: number, y: number, r: number, couleur: number) {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.poly(pts).fill(couleur);
}

function buste(g: Graphics, p: Palette) {
  g.poly(MAILLOT).fill(p.maillot);
  // Col en V et liserés.
  g.poly([-6, -46, 0, -38, 6, -46]).fill(p.peau).stroke({ width: 2, color: p.liseret });
  g.moveTo(-18, -12).lineTo(18, -12).stroke({ width: 3, color: p.liseret });
  // Étoile de capitaine et rangée de médailles.
  etoile(g, 11, -30, 6, p.galon);
  for (const [x, c] of [[-14, 0xd6243a], [-8, 0x2f6fd6], [-2, 0x15925a]] as const) {
    g.rect(x - 2, -38, 4, 6).fill(c);
    g.circle(x, -29, 3).fill(p.galon).stroke({ width: 1, color: p.contour });
  }
  // Short.
  g.poly([-16, 4, 16, 4, 17, -3, -17, -3]).fill(p.short);
  g.poly(MAILLOT).stroke({ width: CONTOUR, color: p.contour, join: "round" });
}

function tete(g: Graphics, p: Palette) {
  g.poly([-6, 3, 7, 3, 6, -9, -5, -9]).fill(p.peau).stroke({ width: CONTOUR, color: p.contour });
  g.circle(2, -19, 14).fill(p.peau).stroke({ width: CONTOUR, color: p.contour });
  // Barbe courte, taillée au cordeau.
  g.moveTo(-8, -12).quadraticCurveTo(-4, -2, 6, -3).quadraticCurveTo(14, -4, 15, -12).stroke({ width: 5, color: p.cheveux, alpha: 0.55 });
  // Casquette d'officier : bandeau galonné, calot, visière.
  g.poly([-14, -27, -12, -39, 4, -44, 18, -38, 17, -27]).fill(p.casquette).stroke({ width: 2.5, color: p.contour, join: "round" });
  g.rect(-13, -30, 30, 5).fill(p.galon);
  etoile(g, 6, -36, 3.5, p.galon);
  g.poly([10, -26, 25, -24, 23, -21, 9, -23]).fill(0x111318).stroke({ width: 2, color: p.contour });
  // Lunettes d'aviateur, sourire en coin.
  g.poly([4, -21, 17, -21, 16, -15, 7, -14]).fill(p.verre).stroke({ width: 2, color: p.galon });
  g.moveTo(9, -8).quadraticCurveTo(13, -6, 16, -9).stroke({ width: 2, color: p.contour, cap: "round" });
  g.poly([16, -16, 19, -11, 15, -11]).fill(p.peau).stroke({ width: 1.4, color: p.contour });
}

function bras(g: Graphics, p: Palette) {
  g.roundRect(-7, -4, 14, 30, 7).fill(p.peau).stroke({ width: CONTOUR, color: p.contour });
  g.roundRect(-9, -7, 18, 15, 6).fill(p.maillot).stroke({ width: CONTOUR, color: p.contour });
  // Épaulette galonnée.
  g.rect(-8, -8, 16, 4).fill(p.galon);
}

function avantBras(g: Graphics, p: Palette) {
  g.poly([-6, -3, 6, -3, 5.5, 20, -5.5, 20]).fill(p.peau).stroke({ width: CONTOUR, color: p.contour });
  g.circle(0, 26, 8).fill(p.gant).stroke({ width: CONTOUR, color: p.contour });
}

function cuisse(g: Graphics, p: Palette) {
  g.roundRect(-8, 10, 16, 22, 7).fill(p.peau).stroke({ width: CONTOUR, color: p.contour });
  g.roundRect(-10, -6, 20, 20, 8).fill(p.short).stroke({ width: CONTOUR, color: p.contour });
}

function tibia(g: Graphics, p: Palette) {
  g.roundRect(-7, -3, 14, 25, 6).fill(p.chaussette).stroke({ width: CONTOUR, color: p.contour });
  g.rect(-6, 2, 12, 3).fill(p.liseret);
  g.poly([-8, 18, 7, 18, 19, 23, 19, 28, -8, 28]).fill(p.crampon).stroke({ width: CONTOUR, color: p.contour, join: "round" });
}

const accessoires: Record<string, (g: Graphics, p: Palette) => void> = {
  porte_voix(g, p) {
    g.rect(-4, 2, 8, 10).fill(0x2a2d36);
    g.poly([-6, 10, 6, 10, 16, 44, -16, 44]).fill(0xf5f7fa).stroke({ width: CONTOUR, color: p.contour, join: "round" });
    g.rect(-16, 38, 32, 6).fill(0xd6243a);
  },
  drapeau(g, p) {
    g.moveTo(0, -10).lineTo(0, 70).stroke({ width: 4, color: 0x8a6a3a });
    g.poly([0, 40, 36, 48, 30, 58, 0, 66]).fill(p.maillot).stroke({ width: 2, color: p.contour });
    etoile(g, 14, 53, 6, p.galon);
  },
  parchemin(g, p) {
    g.roundRect(-18, 6, 36, 26, 3).fill(0xf3e2b8).stroke({ width: 2, color: p.contour });
    for (let y = 12; y < 28; y += 5) g.moveTo(-12, y).lineTo(12, y).stroke({ width: 1.4, color: 0x8a6a3a });
    g.circle(10, 28, 4).fill(0xd6243a);
  },
};

// --- Entités -------------------------------------------------------------

function ballon(): DessinEntite {
  return {
    rotation: 0.3,
    creer(p) {
      const c = new Container();
      const g = new Graphics().circle(0, 0, 16).fill(0xf8f8f8).stroke({ width: CONTOUR, color: p.contour });
      g.poly([0, -6, 6, -2, 4, 5, -4, 5, -6, -2]).fill(0x111318);
      for (const a of [0, 1.26, 2.51, 3.77, 5.03]) {
        g.circle(Math.cos(a - Math.PI / 2) * 13, Math.sin(a - Math.PI / 2) * 13, 3.2).fill(0x111318);
      }
      c.addChild(g);
      return c;
    },
  };
}

function decret(): DessinEntite {
  return {
    remanence: 300,
    creer(p) {
      const c = new Container();
      c.addChild(new Graphics().rect(-95, -65, 190, 130).fill({ color: p.galon, alpha: 0.08 })
        .stroke({ width: 2, color: p.galon, alpha: 0.5 }));
      const g = new Graphics();
      g.roundRect(-40, 44, 80, 20, 4).fill(0xf3e2b8).stroke({ width: 2, color: p.contour });
      g.circle(-42, 54, 7).fill(0xe6cf9a).stroke({ width: 2, color: p.contour });
      g.circle(42, 54, 7).fill(0xe6cf9a).stroke({ width: 2, color: p.contour });
      g.circle(24, 58, 5).fill(0xd6243a);
      c.addChild(g);
      const titre = new Text({
        text: "DÉCRET",
        style: { fontFamily: "Georgia, serif", fontSize: 12, fontWeight: "700", fill: 0x4a3418, letterSpacing: 2 },
      });
      titre.anchor.set(0.5);
      titre.position.set(-4, 54);
      c.addChild(titre);
      return c;
    },
    animer(c, e) {
      c.alpha = e.fin > 0 ? 1 - e.fin : Math.min(1, e.age / 8);
      c.children[0].alpha = 0.6 + 0.4 * Math.sin(e.age * 0.12);
    },
  };
}

function hymne(): DessinEntite {
  return {
    remanence: 650,
    creer() {
      const c = new Container();
      c.addChild(new Graphics());
      return c;
    },
    animer(c, e) {
      const t = Math.min(1, (e.age + 0.5) / 45);
      const g = c.children[0] as Graphics;
      g.clear();
      // Faisceaux de projecteurs, puis l'onde dorée qui s'élargit.
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + e.age * 0.01;
        g.moveTo(0, 0).lineTo(Math.cos(a) * 420, Math.sin(a) * 260).stroke({ width: 10, color: 0xffe9a8, alpha: 0.18 * (1 - t) });
      }
      g.ellipse(0, 0, 380 * t, 230 * t).stroke({ width: 10 * (1 - t) + 2, color: 0xf2c14e, alpha: 0.9 * (1 - t) });
    },
  };
}

export const APPARENCE_SOUHEIL: Apparence = {
  id: "souheil",
  etincelles: 0xf2c14e,
  proportions: {
    hanche: 50, torse: 44, cou: 6, rayonTete: 14,
    epauleAv: [11, 41], epauleAr: [-11, 41], hancheAv: 7, hancheAr: -7,
    bras: [26, 25], jambe: [28, 26], pied: 18,
  },
  palettes: PALETTES,
  dessins: { buste, tete, bras, avantBras, cuisse, tibia, accessoires },
  poses: {
    // Torse bombé, menton levé.
    garde: { bassin: [0, 3, 0], torse: -5, tete: -9, brasAv: [22, 70], brasAr: [-18, 70], jambeAv: [16, -14], jambeAr: [-14, -10] },
    saut: { torse: -4, tete: -6, brasAv: [70, 60], brasAr: [40, 70], jambeAv: [55, -90], jambeAr: [10, -70] },
    chute: { torse: 4, brasAv: [120, 30], brasAr: [100, 40], jambeAv: [25, -30], jambeAr: [-10, -20] },
    dash: { bassin: [4, 8, 0], torse: 34, tete: -18, brasAv: [-45, 30], brasAr: [-55, 30], jambeAv: [55, -40], jambeAr: [-45, -30] },
    touche: { bassin: [-6, 2, -8], torse: -28, tete: -24, brasAv: [80, 20], brasAr: [115, 30], jambeAv: [30, -30], jambeAr: [-10, -30] },
    ko: { rotation: -90, decalage: [0, 48], torse: -6, tete: -10, brasAv: [150, 10], brasAr: [165, 10], jambeAv: [10, -10], jambeAr: [-4, -6] },
    atterrissage: { bassin: [0, 14, 0], torse: 16, brasAv: [30, 60], brasAr: [20, 60], jambeAv: [45, -85], jambeAr: [-25, -75] },
    // Salut militaire.
    victoire: { torse: -8, tete: -10, brasAv: [150, 150], brasAr: [0, 10], jambeAv: [4, -2], jambeAr: [-4, -2] },
  },
  animations: {
    neutre: [
      { f: 0, p: {} }, { f: 3, p: { jambeAv: [60, -100], torse: -6 } },
      { f: 5, p: { jambeAv: [85, -70], torse: -10, bassin: [4, 0, 0] } }, { f: 10, p: { jambeAv: [60, -80] } }, { f: 16, p: {} },
    ],
    neutre2: [
      { f: 0, p: { jambeAv: [40, -60] } }, { f: 4, p: { jambeAv: [-20, -80], torse: 4 } },
      { f: 7, p: { jambeAv: [90, -5], torse: -16, bassin: [6, 2, 0] } }, { f: 12, p: { jambeAv: [85, -10] } }, { f: 24, p: {} },
    ],
    cote: [
      { f: 0, p: {} }, { f: 6, p: { jambeAv: [-40, -90], torse: 10, brasAv: [60, 40], brasAr: [-30, 40] } },
      { f: 10, p: { jambeAv: [100, 0], torse: -22, bassin: [8, 2, 0], brasAv: [-20, 30], brasAr: [70, 30], echelle: [1.04, 0.97] } },
      { f: 14, p: { jambeAv: [110, 0], torse: -24 } }, { f: 24, p: { jambeAv: [40, -30] } }, { f: 32, p: {} },
    ],
    haut: [
      { f: 0, p: {} }, { f: 4, p: { brasAv: [100, 120], torse: -4 } },
      { f: 7, p: { brasAv: [175, 5], torse: -10, tete: -18, echelle: [0.96, 1.05] } },
      { f: 14, p: { brasAv: [170, 10] } }, { f: 28, p: {} },
    ],
    bas: [
      { f: 0, p: {} },
      { f: 4, p: { bassin: [6, 30, -30], torse: -45, tete: -25, jambeAv: [95, 0], jambeAr: [60, -60], brasAv: [-40, 20], brasAr: [-60, 20] } },
      { f: 18, p: { bassin: [6, 30, -30], torse: -45, jambeAv: [95, 0], jambeAr: [60, -60] } }, { f: 36, p: {} },
    ],
    air_neutre: [
      { f: 0, p: {} }, { f: 5, p: { rotation: -60, jambeAv: [100, -10], jambeAr: [30, -60] } },
      { f: 10, p: { rotation: -200, jambeAv: [150, 0], jambeAr: [20, -40] } },
      { f: 16, p: { rotation: -360, jambeAv: [60, -40] } }, { f: 30, p: { rotation: -360 } },
    ],
    air_bas: [
      { f: 0, p: {} }, { f: 6, p: { jambeAv: [70, -110], torse: 8 } },
      { f: 9, p: { jambeAv: [-10, 0], jambeAr: [30, -60], torse: -6, echelle: [0.94, 1.08] } },
      { f: 16, p: { jambeAv: [-10, 0] } }, { f: 30, p: {} },
    ],
    special_neutre: [
      { f: 0, p: {} }, { f: 7, p: { jambeAv: [-50, -80], torse: 8, brasAv: [60, 40] } },
      { f: 11, p: { jambeAv: [80, -10], torse: -18, bassin: [6, 2, 0], echelle: [1.04, 0.97] } }, { f: 20, p: { jambeAv: [60, -20] } }, { f: 32, p: {} },
    ],
    special_cote: [
      { f: 0, p: {} }, { f: 8, p: { brasAv: [90, 60], torse: -8, bassin: [-4, 2, 0] } },
      { f: 12, p: { brasAv: [95, 0], torse: 12, bassin: [6, 3, 0], tete: 4 } }, { f: 22, p: { brasAv: [92, 5], torse: 10 } }, { f: 40, p: {} },
    ],
    special_haut: [
      { f: 0, p: { bassin: [0, 12, 0], jambeAv: [45, -85], jambeAr: [-20, -75], brasAv: [60, 60] } },
      { f: 3, p: { brasAv: [175, 0], jambeAv: [5, -5], jambeAr: [-5, -5], echelle: [0.92, 1.1] } },
      { f: 16, p: { brasAv: [170, 5] } }, { f: 40, p: {} },
    ],
    special_bas: [
      { f: 0, p: {} }, { f: 8, p: { brasAv: [100, 60], brasAr: [90, 60], torse: -6 } },
      { f: 14, p: { brasAv: [60, 20], brasAr: [50, 20], torse: 20, bassin: [0, 10, 0] } }, { f: 34, p: {} },
    ],
    ultime: [
      { f: 0, p: {} }, { f: 14, p: { brasAv: [150, 10], brasAr: [150, 10], torse: -12, tete: -20 } },
      { f: 30, p: { brasAv: [165, 0], brasAr: [165, 0], torse: -16, tete: -24, echelle: [0.96, 1.06] } },
      { f: 44, p: { brasAv: [100, 120], brasAr: [165, 0], torse: -8 } }, { f: 80, p: {} },
    ],
  },
  effets: {
    neutre2: { trainee: ["piedAv"] },
    cote: { trainee: ["piedAv"], couleurTrainee: 0xf2c14e, textesTouche: ["BUT !"] },
    haut: { trainee: ["poingAv"], couleurTrainee: 0xf2c14e },
    bas: { trainee: ["piedAv"] },
    air_neutre: { trainee: ["piedAv", "piedAr"] },
    air_bas: { trainee: ["piedAv"] },
    special_neutre: { trainee: ["piedAv"], couleurTrainee: 0xf2c14e },
    special_cote: { accessoire: "porte_voix", textes: [{ f: 12, texte: "SILENCE !", membre: "poingAv", taille: 30, couleur: 0xf2c14e }] },
    special_haut: { accessoire: "drapeau" },
    special_bas: { accessoire: "parchemin", textes: [{ f: 14, texte: "DÉCRET", membre: "tete", taille: 28, couleur: 0xf2c14e }] },
    ultime: { embleme: "★", textes: [{ f: 30, texte: "MES AMIS !", membre: "tete", taille: 36, couleur: 0xf2c14e }] },
  },
  entites: { ballon: ballon(), decret: decret(), hymne: hymne() },
};
