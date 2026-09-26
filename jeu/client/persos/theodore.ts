import { Container, Graphics } from "pixi.js";
import type { Apparence, Cle, DessinEntite, Palette } from "./types";

/*
 * Absolut Théodore, en vecteurs : costume noir cintré, chemise blanche,
 * cravate fine, lunettes noires impassibles, raie impeccable. Clap de
 * cinéma, pied-de-biche et lampe torche d'urbexeur. Contours clairs, pour
 * que le costume reste lisible sur fond sombre.
 */

const CONTOUR = 3;

const PALETTES: Palette[] = [
  { peau: 0xf0c8a8, ombre: 0xd4a888, costume: 0x1f222b, revers: 0x343945, chemise: 0xf4f4f2, cravate: 0x0d0e11, pochette: 0xe23b3b, cheveux: 0x2a1d14, verre: 0x0b0c0f, chaussure: 0x0b0c0f, contour: 0x6a7182, accent: 0xe8c872 },
  { peau: 0xf0c8a8, ombre: 0xd4a888, costume: 0x1b2a4a, revers: 0x2a3c62, chemise: 0xf4f4f2, cravate: 0x9a1b2a, pochette: 0xf4f4f2, cheveux: 0x2a1d14, verre: 0x0b0c0f, chaussure: 0x0b0c0f, contour: 0x6a7a9a, accent: 0xe8c872 },
  { peau: 0xd9a57f, ombre: 0xb98962, costume: 0x3a3d44, revers: 0x4c5059, chemise: 0xf4f4f2, cravate: 0x1a1c20, pochette: 0x5ad1ff, cheveux: 0x140d09, verre: 0x0b0c0f, chaussure: 0x0b0c0f, contour: 0x7a808c, accent: 0xe8c872 },
  { peau: 0xf0c8a8, ombre: 0xd4a888, costume: 0x4a1420, revers: 0x62202e, chemise: 0xf4f4f2, cravate: 0x0d0e11, pochette: 0xe8c872, cheveux: 0x3a2618, verre: 0x0b0c0f, chaussure: 0x0b0c0f, contour: 0x8a5a66, accent: 0xe8c872 },
];

const VESTE: number[] = [-14, 8, -17, -12, -20, -32, -16, -43, -8, -46, 8, -46, 16, -43, 20, -32, 17, -12, 15, 8];

function buste(g: Graphics, p: Palette) {
  g.poly(VESTE).fill(p.costume);
  // Plastron : chemise blanche et cravate fine dans le V des revers.
  g.poly([-4, -46, 7, -46, 3, -20]).fill(p.chemise);
  g.poly([1, -44, 4, -44, 4.5, -26, 2.5, -22, 0.5, -26]).fill(p.cravate);
  g.poly([-4, -46, -9, -30, 3, -20]).fill(p.revers);
  g.poly([7, -46, 13, -30, 3, -20]).fill(p.revers);
  // Pochette, boutons.
  g.poly([-15, -32, -9, -32, -10, -28, -14, -28]).fill(p.pochette);
  g.circle(3, -14, 1.6).fill(p.contour);
  g.circle(3, -6, 1.6).fill(p.contour);
  g.poly(VESTE).stroke({ width: CONTOUR, color: p.contour, join: "round" });
}

function tete(g: Graphics, p: Palette) {
  g.poly([-6, 3, 7, 3, 6, -9, -5, -9]).fill(p.peau).stroke({ width: CONTOUR, color: p.contour });
  g.poly([-5, 1, 8, 1, 6, -4, -3, -4]).fill(p.chemise);
  g.circle(2, -20, 13.5).fill(p.peau).stroke({ width: CONTOUR, color: p.contour });
  // Mâchoire nette.
  g.moveTo(-6, -10).lineTo(2, -6).lineTo(14, -10).stroke({ width: 2, color: p.ombre });
  // Cheveux plaqués, raie sur le côté.
  g.poly([-12, -18, -13, -30, -4, -36, 10, -35, 16, -28, 6, -29, -2, -27, -6, -20]).fill(p.cheveux).stroke({ width: 2, color: p.contour, join: "round" });
  g.moveTo(4, -34).lineTo(-1, -28).stroke({ width: 1.5, color: 0x5a4636 });
  // Lunettes noires impassibles, bouche droite.
  g.roundRect(4, -24, 13, 6, 2).fill(p.verre).stroke({ width: 1.6, color: p.contour });
  g.moveTo(4, -22).lineTo(-6, -21).stroke({ width: 1.8, color: p.verre });
  g.moveTo(9, -11).lineTo(15, -11.5).stroke({ width: 2, color: p.contour, cap: "round" });
  g.poly([15, -18, 18.5, -13, 14.5, -13]).fill(p.peau).stroke({ width: 1.4, color: p.contour });
}

function bras(g: Graphics, p: Palette) {
  g.roundRect(-7, -5, 14, 33, 7).fill(p.costume).stroke({ width: CONTOUR, color: p.contour });
}

function avantBras(g: Graphics, p: Palette) {
  g.poly([-6, -3, 6, -3, 6, 19, -6, 19]).fill(p.costume).stroke({ width: CONTOUR, color: p.contour });
  g.rect(-6, 17, 12, 4).fill(p.chemise);
  g.ellipse(0, 26, 6.5, 7.5).fill(p.peau).stroke({ width: CONTOUR, color: p.contour });
}

function cuisse(g: Graphics, p: Palette) {
  g.roundRect(-7.5, -6, 15, 38, 7).fill(p.costume).stroke({ width: CONTOUR, color: p.contour });
  g.moveTo(1, 2).lineTo(1, 28).stroke({ width: 1.4, color: p.revers });
}

function tibia(g: Graphics, p: Palette) {
  g.roundRect(-7, -3, 14, 27, 6).fill(p.costume).stroke({ width: CONTOUR, color: p.contour });
  g.poly([-7, 20, 7, 20, 20, 25, 20, 29, -7, 29]).fill(p.chaussure).stroke({ width: CONTOUR, color: p.contour, join: "round" });
  g.moveTo(8, 23).lineTo(16, 25).stroke({ width: 1.2, color: 0xffffff, alpha: 0.4 });
}

const accessoires: Record<string, (g: Graphics, p: Palette) => void> = {
  clap(g, p) {
    g.rect(-14, 8, 28, 20).fill(0x111318).stroke({ width: 2, color: p.contour });
    g.poly([-14, 2, 14, 2, 14, 8, -14, 8]).fill(0xf4f4f2);
    for (let x = -12; x < 14; x += 7) g.poly([x, 2, x + 3, 2, x + 6, 8, x + 3, 8]).fill(0x111318);
    g.moveTo(-10, 16).lineTo(10, 16).moveTo(-10, 22).lineTo(6, 22).stroke({ width: 1.4, color: 0xf4f4f2 });
  },
  pied_de_biche(g, p) {
    g.moveTo(0, 0).lineTo(0, 58).stroke({ width: 5, color: 0xb23a2e, cap: "round" });
    g.moveTo(0, 58).quadraticCurveTo(0, 68, 9, 66).stroke({ width: 5, color: 0xb23a2e, cap: "round" });
    g.moveTo(0, 0).lineTo(-6, -6).stroke({ width: 5, color: 0xb23a2e, cap: "round" });
    void p;
  },
  lampe(g, p) {
    // Faisceau d'abord, sous la lampe.
    g.poly([-5, 16, 5, 16, 58, 230, -58, 230]).fill({ color: 0xfff6cc, alpha: 0.22 });
    g.roundRect(-5, 0, 10, 18, 3).fill(0x2a2d36).stroke({ width: 2, color: p.contour });
    g.rect(-6, 14, 12, 4).fill(0xfff1a8);
  },
  grappin(g, p) {
    g.roundRect(-6, 0, 12, 24, 3).fill(0x3a3f4b).stroke({ width: 2, color: p.contour });
    g.poly([-4, 22, 4, 22, 3, 30, -3, 30]).fill(0xc8ced8);
  },
};

// --- Entités -------------------------------------------------------------

function grappin(): DessinEntite {
  return {
    lien: 0xcfd6e4,
    creer(p) {
      const c = new Container();
      const g = new Graphics();
      g.circle(0, 0, 6).fill(0xc8ced8).stroke({ width: 2, color: p.contour });
      for (const a of [-0.6, 0, 0.6]) {
        g.moveTo(0, 0).lineTo(Math.cos(a) * 16, Math.sin(a) * 16).stroke({ width: 3.5, color: 0xc8ced8, cap: "round" });
      }
      c.addChild(g);
      return c;
    },
    animer(c, e) {
      if (!e.accroche) c.rotation = Math.atan2(e.vy, e.vx);
    },
  };
}

function fil(): DessinEntite {
  return {
    creer(p) {
      const c = new Container();
      const g = new Graphics();
      for (const x of [-58, 58]) {
        g.rect(x - 3, -18, 6, 18).fill(0x3a3f4b).stroke({ width: 2, color: p.contour });
        g.circle(x, -18, 3).fill(0xe23b3b);
      }
      c.addChild(g);
      c.addChild(new Graphics().moveTo(-56, -12).lineTo(56, -12).stroke({ width: 2, color: 0xff3b3b }));
      return c;
    },
    animer(c, e) {
      // Le fil ne s'allume qu'une fois armé, puis scintille.
      const arme = e.age >= 45;
      c.children[1].visible = arme;
      c.children[1].alpha = 0.55 + 0.45 * Math.sin(e.age * 0.5);
      c.position.y += 8;
    },
  };
}

function filDeclenche(): DessinEntite {
  return {
    remanence: 380,
    creer() {
      const c = new Container();
      c.addChild(new Graphics());
      return c;
    },
    animer(c, e) {
      const t = Math.min(1, (e.age + 0.5) / 26);
      const g = c.children[0] as Graphics;
      g.clear();
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 + (i - 4) * 0.28;
        const r = 20 + 80 * t;
        g.moveTo(Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4 + 30).lineTo(Math.cos(a) * r, Math.sin(a) * r + 30)
          .stroke({ width: 3, color: i % 2 ? 0xff3b3b : 0xffe066, alpha: 1 - t });
      }
    },
  };
}

/** La scène de l'ultime : cinq plans (coups alternés), puis le coup final. */
function scene(): Cle[] {
  const cles: Cle[] = [{ f: 0, p: { torse: 6 } }];
  [14, 26, 38, 50, 62].forEach((h, i) => {
    const avant = i % 2 === 0;
    cles.push({ f: h - 4, p: avant ? { brasAv: [150, 60], torse: -10 } : { brasAr: [150, 60], torse: -10 } });
    cles.push({ f: h, p: avant ? { brasAv: [60, 0], brasAr: [20, 60], torse: 26, bassin: [8, 4, 0] } : { brasAr: [60, 0], brasAv: [20, 60], torse: 26, bassin: [8, 4, 0] } });
  });
  cles.push({ f: 80, p: { rotation: -20, bassin: [-6, 10, 0], brasAv: [170, 10], torse: -14, jambeAv: [60, -80] } });
  cles.push({ f: 88, p: { rotation: 0, bassin: [12, 4, 0], brasAv: [95, 0], torse: 34, jambeAv: [80, -10], echelle: [1.06, 0.95] } });
  cles.push({ f: 104, p: { brasAv: [140, 150], torse: -4, tete: -10 } });
  cles.push({ f: 120, p: {} });
  return cles;
}

export const APPARENCE_THEODORE: Apparence = {
  id: "theodore",
  etincelles: 0xe8c872,
  proportions: {
    hanche: 52, torse: 46, cou: 7, rayonTete: 14,
    epauleAv: [9, 43], epauleAr: [-9, 43], hancheAv: 6, hancheAr: -6,
    bras: [27, 26], jambe: [29, 27], pied: 18,
  },
  palettes: PALETTES,
  dessins: { buste, tete, bras, avantBras, cuisse, tibia, accessoires },
  poses: {
    // Mains le long du corps, impassible.
    garde: { bassin: [0, 2, 0], torse: -2, tete: -4, brasAv: [10, 20], brasAr: [4, 16], jambeAv: [12, -10], jambeAr: [-10, -6] },
    saut: { torse: -6, tete: -6, brasAv: [60, 60], brasAr: [30, 70], jambeAv: [60, -100], jambeAr: [15, -80] },
    chute: { torse: 6, brasAv: [120, 30], brasAr: [100, 30], jambeAv: [20, -20], jambeAr: [-8, -16] },
    dash: { bassin: [6, 10, 0], torse: 44, tete: -26, brasAv: [-50, 10], brasAr: [-60, 10], jambeAv: [60, -50], jambeAr: [-50, -30] },
    touche: { bassin: [-6, 2, -8], torse: -26, tete: -20, brasAv: [80, 20], brasAr: [110, 30], jambeAv: [30, -30], jambeAr: [-10, -30] },
    ko: { rotation: -90, decalage: [0, 50], torse: -6, tete: -8, brasAv: [150, 10], brasAr: [165, 10], jambeAv: [10, -10], jambeAr: [-4, -6] },
    atterrissage: { bassin: [0, 16, 0], torse: 20, brasAv: [30, 40], brasAr: [20, 40], jambeAv: [50, -95], jambeAr: [-25, -80] },
    // Il remonte ses lunettes. Absolut.
    victoire: { torse: -2, tete: -6, brasAv: [140, 155], brasAr: [5, 15], jambeAv: [8, -4], jambeAr: [-8, -4] },
  },
  animations: {
    neutre: [{ f: 0, p: {} }, { f: 2, p: { brasAv: [60, 90] } }, { f: 3, p: { brasAv: [92, 0], torse: 10 } }, { f: 8, p: { brasAv: [85, 10] } }, { f: 14, p: {} }],
    neutre2: [{ f: 0, p: {} }, { f: 2, p: { brasAr: [60, 90] } }, { f: 3, p: { brasAr: [92, 0], torse: 14 } }, { f: 8, p: { brasAr: [85, 10] } }, { f: 14, p: {} }],
    neutre3: [
      { f: 0, p: {} }, { f: 4, p: { brasAv: [160, 40], torse: -8 } },
      { f: 6, p: { brasAv: [70, 0], torse: 20, bassin: [6, 4, 0], echelle: [1.05, 0.96] } }, { f: 14, p: { brasAv: [60, 10] } }, { f: 24, p: {} },
    ],
    cote: [
      { f: 0, p: {} }, { f: 3, p: { torse: 40, tete: -24, brasAv: [-30, 40], jambeAv: [60, -40], jambeAr: [-40, -20] } },
      { f: 7, p: { torse: 30, brasAv: [95, 0], brasAr: [-50, 20], bassin: [6, 6, 0] } }, { f: 16, p: { brasAv: [85, 10] } }, { f: 30, p: {} },
    ],
    haut: [
      { f: 0, p: {} }, { f: 3, p: { bassin: [0, 10, 0], torse: 10, jambeAv: [40, -80] } },
      { f: 6, p: { rotation: -40, torse: -20, jambeAv: [170, 0], jambeAr: [-20, -30], brasAv: [-60, 20], brasAr: [-50, 20] } },
      { f: 12, p: { rotation: -30, jambeAv: [160, 0] } }, { f: 28, p: {} },
    ],
    bas: [
      { f: 0, p: {} }, { f: 4, p: { bassin: [0, 18, 0], torse: 30, brasAv: [150, 30], jambeAv: [60, -90], jambeAr: [-30, -80] } },
      { f: 7, p: { bassin: [0, 20, 0], torse: 38, brasAv: [40, 0], jambeAv: [60, -95], jambeAr: [-30, -85] } },
      { f: 14, p: { bassin: [0, 18, 0], torse: 32, brasAv: [30, 10] } }, { f: 26, p: {} },
    ],
    air_neutre: [
      { f: 0, p: {} }, { f: 4, p: { rotation: 0, jambeAv: [90, 0], brasAv: [90, 0] } },
      { f: 12, p: { rotation: 360, jambeAv: [90, 0], brasAv: [90, 0] } }, { f: 26, p: { rotation: 360 } },
    ],
    air_bas: [
      { f: 0, p: {} }, { f: 5, p: { rotation: 30, jambeAv: [60, -100], torse: 10 } },
      { f: 8, p: { rotation: 40, jambeAv: [40, 0], jambeAr: [-10, -60], brasAv: [-40, 20], brasAr: [-50, 20] } },
      { f: 20, p: { rotation: 40, jambeAv: [40, 0] } }, { f: 34, p: {} },
    ],
    // Le faisceau suit l'avant-bras : bras à l'horizontale pendant toute la zone active.
    special_neutre: [
      { f: 0, p: {} }, { f: 6, p: { brasAv: [90, 0], torse: -4, bassin: [2, 2, 0] } },
      { f: 22, p: { brasAv: [90, 0], torse: -4, bassin: [2, 2, 0] } }, { f: 34, p: {} },
    ],
    special_cote: [
      { f: 0, p: {} }, { f: 4, p: { torse: 40, tete: -24, brasAv: [-50, 10], brasAr: [-60, 10], jambeAv: [60, -50], jambeAr: [-50, -30] } },
      { f: 12, p: { torse: 40, brasAv: [-50, 10] } }, { f: 20, p: { torse: 6 } }, { f: 30, p: {} },
    ],
    special_haut: [
      { f: 0, p: { brasAv: [60, 60] } }, { f: 3, p: { brasAv: [135, 0], torse: -10, tete: -20 } },
      { f: 40, p: { brasAv: [140, 0], jambeAv: [40, -60], jambeAr: [10, -40] } }, { f: 60, p: {} },
    ],
    special_bas: [
      { f: 0, p: {} }, { f: 6, p: { bassin: [0, 22, 0], torse: 40, brasAv: [70, 10], jambeAv: [65, -100], jambeAr: [-30, -90] } },
      { f: 14, p: { bassin: [0, 22, 0], torse: 38, brasAv: [60, 20] } }, { f: 26, p: {} },
    ],
    ultime: [
      { f: 0, p: {} }, { f: 5, p: { torse: 46, tete: -26, brasAv: [-40, 20], jambeAv: [60, -50], jambeAr: [-50, -30] } },
      { f: 8, p: { torse: 30, brasAv: [95, 0], bassin: [6, 6, 0] } }, { f: 18, p: { brasAv: [90, 5] } }, { f: 44, p: {} },
    ],
    ultime_scene: scene(),
  },
  effets: {
    neutre: { accessoire: "clap", trainee: ["poingAv"] },
    neutre2: { accessoire: "clap", trainee: ["poingAr"] },
    neutre3: { accessoire: "clap", trainee: ["poingAv"], textes: [{ f: 6, texte: "CLAC !", membre: "poingAv", taille: 28, couleur: 0xe8c872 }] },
    cote: { trainee: ["poingAv", "torse"], couleurTrainee: 0xe8c872 },
    haut: { trainee: ["piedAv"] },
    bas: { accessoire: "pied_de_biche", trainee: ["poingAv"], couleurTrainee: 0xb23a2e },
    air_neutre: { trainee: ["piedAv", "poingAv"] },
    air_bas: { trainee: ["piedAv"] },
    special_neutre: { accessoire: "lampe" },
    special_cote: { fantome: true, trainee: ["torse"], couleurTrainee: 0x2a2e38 },
    special_haut: { accessoire: "grappin" },
    ultime: { trainee: ["torse"], couleurTrainee: 0xe8c872 },
    ultime_scene: {
      cinema: "ABSOLUT CINEMA",
      trainee: ["poingAv", "poingAr"],
      couleurTrainee: 0xe8c872,
      textesTouche: ["Moteur…", "Ça tourne", "Action !", "Prise 2", "Prise 3", "COUPEZ !"],
    },
  },
  entites: { grappin: grappin(), fil: fil(), fil_declenche: filDeclenche() },
};
