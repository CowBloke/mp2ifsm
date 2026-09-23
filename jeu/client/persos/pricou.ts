import { Container, Graphics } from "pixi.js";
import type { Apparence, DessinEntite, Palette } from "./types";

/*
 * Mr Pricou, en vecteurs : grand et dégingandé, blouse blanche ouverte
 * sur chemise et cravate, lunettes rondes, cheveux blancs en bataille,
 * sourire de savant fou. Ses effets sont bleu électrique.
 */

const CONTOUR = 3;

const PALETTES: Palette[] = [
  { peau: 0xf1c9a5, ombre: 0xd4a684, blouse: 0xf4f6f8, pli: 0xc9d2dc, chemise: 0x8ec5ff, cravate: 0xd6453d, pantalon: 0x3b4252, chaussure: 0x5a3d2b, cheveux: 0xe9e9ee, verre: 0xbfe6ff, contour: 0x0b0d14, accent: 0x5ad1ff },
  { peau: 0xf1c9a5, ombre: 0xd4a684, blouse: 0xfff3c4, pli: 0xe0cf92, chemise: 0xff9f7a, cravate: 0x2f6fd6, pantalon: 0x2d3440, chaussure: 0x3b2a20, cheveux: 0xe9e9ee, verre: 0xfff0c2, contour: 0x0b0d14, accent: 0xffc24a },
  { peau: 0xe0ad84, ombre: 0xbf8c63, blouse: 0xd8f6ee, pli: 0xa8d6c8, chemise: 0xc39bff, cravate: 0x1f9e5a, pantalon: 0x34303d, chaussure: 0x2a2a2a, cheveux: 0xd9d9de, verre: 0xc9ffe9, contour: 0x0b0d14, accent: 0x7cff9a },
  { peau: 0xf1c9a5, ombre: 0xd4a684, blouse: 0xebe2ff, pli: 0xc2b3ec, chemise: 0xffd166, cravate: 0x7a3db8, pantalon: 0x2f3444, chaussure: 0x4a3222, cheveux: 0xf0f0f4, verre: 0xf4d9ff, contour: 0x0b0d14, accent: 0xff7ad9 },
];

const BLOUSE: number[] = [-15, 4, -18, -12, -21, -32, -17, -42, -8, -45, 8, -45, 17, -42, 21, -32, 18, -12, 16, 4];

function buste(g: Graphics, p: Palette) {
  // Pan de blouse qui flotte derrière, sous les hanches.
  g.poly([-15, -2, -27, 30, -8, 27, -2, 4]).fill(p.blouse).stroke({ width: CONTOUR, color: p.contour, join: "round" });
  g.poly(BLOUSE).fill(p.blouse);
  // Chemise et cravate dans l'ouverture de la blouse.
  g.poly([-3, -45, 7, -45, 5, -6, -1, -6]).fill(p.chemise);
  g.poly([1, -42, 5, -42, 6, -22, 3, -17, 0, -22]).fill(p.cravate).stroke({ width: 1.5, color: p.contour });
  // Revers et plis.
  g.moveTo(-3, -45).lineTo(-6, -24).lineTo(-1, -6).stroke({ width: 2, color: p.pli });
  g.moveTo(7, -45).lineTo(10, -24).lineTo(5, -6).stroke({ width: 2, color: p.pli });
  // Poche à stylos.
  g.roundRect(-14, -30, 9, 10, 2).stroke({ width: 1.8, color: p.pli });
  g.moveTo(-12, -32).lineTo(-12, -27).stroke({ width: 2, color: 0x2f6fd6 });
  g.moveTo(-9, -33).lineTo(-9, -27).stroke({ width: 2, color: 0xd6453d });
  g.poly(BLOUSE).stroke({ width: CONTOUR, color: p.contour, join: "round" });
}

function tete(g: Graphics, p: Palette) {
  g.poly([-6, 3, 7, 3, 6, -9, -5, -9]).fill(p.peau).stroke({ width: CONTOUR, color: p.contour });
  // Cheveux en bataille, derrière et au-dessus du crâne.
  g.poly([-16, -12, -24, -18, -17, -24, -25, -32, -14, -33, -16, -43, -5, -38, -2, -48, 5, -39, 12, -46, 13, -36, 21, -38, 16, -30, 10, -30])
    .fill(p.cheveux).stroke({ width: 2.5, color: p.contour, join: "round" });
  // Visage allongé.
  g.ellipse(3, -19, 12.5, 16).fill(p.peau).stroke({ width: CONTOUR, color: p.contour });
  g.ellipse(-6, -19, 3, 5).fill(p.ombre);
  // Sourcil haussé, lunettes rondes, nez, sourire de savant fou.
  g.moveTo(6, -30).quadraticCurveTo(11, -34, 17, -31).stroke({ width: 2.6, color: p.cheveux, cap: "round" });
  g.circle(11, -23, 6).fill({ color: p.verre, alpha: 0.85 }).stroke({ width: 2.4, color: p.contour });
  g.circle(12.5, -23, 1.8).fill(p.contour);
  g.moveTo(5, -23).lineTo(-5, -21).stroke({ width: 1.8, color: p.contour });
  g.poly([16, -20, 21, -13, 15, -12]).fill(p.peau).stroke({ width: 1.6, color: p.contour });
  g.moveTo(5, -8).quadraticCurveTo(11, -3, 17, -9).lineTo(5, -8).fill(0xffffff).stroke({ width: 1.8, color: p.contour });
}

function bras(g: Graphics, p: Palette) {
  g.roundRect(-7, -5, 14, 34, 7).fill(p.blouse).stroke({ width: CONTOUR, color: p.contour });
  g.moveTo(-2, 4).lineTo(-3, 22).stroke({ width: 1.6, color: p.pli });
}

function avantBras(g: Graphics, p: Palette) {
  g.poly([-6, -3, 6, -3, 7, 20, -7, 20]).fill(p.blouse).stroke({ width: CONTOUR, color: p.contour });
  g.rect(-6, 16, 12, 5).fill(p.pli);
  g.ellipse(0, 27, 7, 8).fill(p.peau).stroke({ width: CONTOUR, color: p.contour });
}

function cuisse(g: Graphics, p: Palette) {
  g.roundRect(-8, -6, 16, 38, 7).fill(p.pantalon).stroke({ width: CONTOUR, color: p.contour });
}

function tibia(g: Graphics, p: Palette) {
  g.roundRect(-7, -3, 14, 27, 6).fill(p.pantalon).stroke({ width: CONTOUR, color: p.contour });
  g.poly([-8, 20, 6, 20, 17, 24, 17, 29, -8, 29]).fill(p.chaussure).stroke({ width: CONTOUR, color: p.contour, join: "round" });
}

const accessoires: Record<string, (g: Graphics, p: Palette) => void> = {
  regle(g, p) {
    g.rect(-3.5, 2, 7, 58).fill(0xf6d365).stroke({ width: 2, color: p.contour });
    for (let y = 8; y < 58; y += 6) g.moveTo(-3.5, y).lineTo(y % 12 === 8 ? 1 : -0.5, y).stroke({ width: 1.2, color: p.contour });
  },
  pendule(g, p) {
    g.moveTo(0, 2).lineTo(0, 78).stroke({ width: 2, color: 0xdfe6ee });
    g.circle(0, 86, 12).fill(0xd9a441).stroke({ width: CONTOUR, color: p.contour });
    g.circle(-3, 82, 3.5).fill({ color: 0xffffff, alpha: 0.6 });
  },
  fiole(g, p) {
    g.poly([-4, 0, 4, 0, 4, 8, 11, 20, 8, 26, -8, 26, -11, 20, -4, 8]).fill({ color: 0xffffff, alpha: 0.55 }).stroke({ width: 2, color: p.contour });
    g.poly([-9, 19, 9, 19, 7, 24, -7, 24]).fill(0x69e36b);
  },
  aimant(g, p) {
    g.arc(0, 12, 11, Math.PI, 0).stroke({ width: 8, color: 0xd6453d });
    g.moveTo(-11, 12).lineTo(-11, 22).stroke({ width: 8, color: 0xd6453d });
    g.moveTo(11, 12).lineTo(11, 22).stroke({ width: 8, color: 0x2f6fd6 });
    g.rect(-15, 20, 8, 5).fill(0xe8edf2);
    g.rect(7, 20, 8, 5).fill(0xe8edf2);
    void p;
  },
};

// --- Entités -------------------------------------------------------------

function electron(): DessinEntite {
  return {
    creer(p) {
      const c = new Container();
      c.addChild(new Graphics().circle(0, 0, 24).fill({ color: p.accent, alpha: 0.28 }));
      const orbites = new Graphics()
        .ellipse(0, 0, 22, 8).stroke({ width: 2, color: p.accent, alpha: 0.9 })
        .ellipse(0, 0, 8, 22).stroke({ width: 2, color: p.accent, alpha: 0.6 });
      c.addChild(orbites);
      c.addChild(new Graphics().circle(0, 0, 10).fill(0xffffff).stroke({ width: 3, color: p.accent }));
      c.addChild(new Graphics().moveTo(-4, 0).lineTo(4, 0).stroke({ width: 2.5, color: 0x0b2a44 }));
      return c;
    },
    animer(c, e) {
      c.children[1].rotation = e.age * 0.35;
      c.children[0].scale.set(1 + 0.12 * Math.sin(e.age * 0.5));
    },
  };
}

function fiole(): DessinEntite {
  return {
    rotation: 0.28,
    creer(p) {
      const c = new Container();
      const g = new Graphics();
      accessoires.fiole(g, p);
      g.position.set(0, -13);
      c.addChild(g);
      return c;
    },
  };
}

function flaque(): DessinEntite {
  return {
    remanence: 300,
    creer() {
      const c = new Container();
      c.addChild(new Graphics().ellipse(0, 6, 88, 13).fill({ color: 0x3fcf5e, alpha: 0.5 }).stroke({ width: 2, color: 0x9dffb0, alpha: 0.8 }));
      c.addChild(new Graphics());
      return c;
    },
    animer(c, e) {
      c.alpha = e.fin > 0 ? 1 - e.fin : Math.min(1, e.age / 6);
      const bulles = c.children[1] as Graphics;
      bulles.clear();
      for (let i = 0; i < 5; i++) {
        const t = (e.age * 0.04 + i * 0.37) % 1;
        bulles.circle(-60 + i * 30, 4 - t * 16, 3 + 3 * (1 - t)).stroke({ width: 1.5, color: 0xc8ffd3, alpha: 1 - t });
      }
    },
  };
}

function explosion(rayon: number, couleurs: [number, number], duree: number): DessinEntite {
  return {
    remanence: duree,
    creer() {
      const c = new Container();
      c.addChild(new Graphics());
      return c;
    },
    animer(c, e) {
      const t = Math.min(1, (e.age + 0.5) / (e.duree + (duree / 16.7)));
      const g = c.children[0] as Graphics;
      g.clear();
      const r = rayon * (0.35 + 0.65 * (1 - (1 - t) ** 3));
      g.circle(0, 0, r).fill({ color: couleurs[0], alpha: 0.35 * (1 - t) });
      g.circle(0, 0, r * 0.55).fill({ color: couleurs[1], alpha: 0.7 * (1 - t) });
      g.circle(0, 0, r).stroke({ width: 5 * (1 - t) + 1, color: 0xffffff, alpha: 0.9 * (1 - t) });
    },
  };
}

function aimant(): DessinEntite {
  return {
    creer(p) {
      const c = new Container();
      const g = new Graphics();
      accessoires.aimant(g, p);
      g.position.set(0, -12);
      c.addChild(g);
      c.addChild(new Graphics().circle(0, -22, 4).fill(0xffe066));
      return c;
    },
    animer(c, e) {
      // Témoin : clignote de plus en plus vite une fois armé.
      const arme = e.age >= 40;
      c.children[1].visible = arme && Math.sin(e.age * 0.4) > 0;
    },
  };
}

function champMagnetique(): DessinEntite {
  return {
    remanence: 250,
    creer(p) {
      const c = new Container();
      const g = new Graphics();
      for (let i = 1; i <= 3; i++) {
        g.ellipse(0, 0, 36 * i, 22 * i).stroke({ width: 3, color: i % 2 ? 0xd6453d : 0x2f6fd6, alpha: 0.7 });
      }
      g.circle(0, 0, 16).fill({ color: p.accent, alpha: 0.4 });
      c.addChild(g);
      return c;
    },
    animer(c, e) {
      const pulse = 1 - ((e.age * 0.08) % 1) * 0.35;
      c.scale.set(pulse);
      c.alpha = e.fin > 0 ? 1 - e.fin : 0.85;
    },
  };
}

function trouNoir(): DessinEntite {
  return {
    creer() {
      const c = new Container();
      c.addChild(new Graphics().circle(0, 0, 70).stroke({ width: 2, color: 0xffffff, alpha: 0.25 }));
      const disque = new Graphics()
        .ellipse(0, 0, 70, 20).fill({ color: 0xff9f43, alpha: 0.35 })
        .ellipse(0, 0, 58, 14).stroke({ width: 4, color: 0xffd08a, alpha: 0.9 })
        .ellipse(0, 0, 76, 24).stroke({ width: 2, color: 0xb36bff, alpha: 0.8 });
      c.addChild(disque);
      c.addChild(new Graphics().circle(0, 0, 30).fill(0x000000).stroke({ width: 3, color: 0xb36bff }));
      return c;
    },
    animer(c, e) {
      const croissance = Math.min(1, e.age / 20);
      c.scale.set(0.3 + 0.7 * croissance);
      c.children[1].rotation = e.age * 0.06;
      c.children[0].scale.set(1 + 0.25 * Math.sin(e.age * 0.3));
    },
  };
}

// --- Animations ----------------------------------------------------------

const DEBOUT = { torse: 2, tete: -3 };

export const APPARENCE_PRICOU: Apparence = {
  id: "pricou",
  etincelles: 0x5ad1ff,
  proportions: {
    hanche: 52, torse: 45, cou: 7, rayonTete: 15,
    epauleAv: [9, 42], epauleAr: [-9, 42], hancheAv: 6, hancheAr: -6,
    bras: [28, 27], jambe: [29, 27], pied: 16,
  },
  palettes: PALETTES,
  dessins: { buste, tete, bras, avantBras, cuisse, tibia, accessoires },
  poses: {
    // Un doigt levé : il explique.
    garde: { ...DEBOUT, bassin: [0, 2, 0], brasAv: [45, 125], brasAr: [8, 18], jambeAv: [10, -8], jambeAr: [-8, -6] },
    saut: { torse: -6, tete: -8, brasAv: [110, 60], brasAr: [150, 40], jambeAv: [50, -90], jambeAr: [10, -70] },
    chute: { torse: 4, brasAv: [150, 30], brasAr: [130, 40], jambeAv: [25, -25], jambeAr: [-5, -20] },
    dash: { bassin: [4, 6, 0], torse: 30, tete: -18, brasAv: [-40, 20], brasAr: [-55, 20], jambeAv: [50, -40], jambeAr: [-40, -25] },
    touche: { bassin: [-6, 2, -8], torse: -28, tete: -22, brasAv: [90, 20], brasAr: [120, 30], jambeAv: [30, -30], jambeAr: [-10, -30] },
    ko: { rotation: -90, decalage: [0, 52], torse: -6, tete: -14, brasAv: [150, 20], brasAr: [165, 10], jambeAv: [10, -10], jambeAr: [-4, -6] },
    atterrissage: { bassin: [0, 14, 0], torse: 16, brasAv: [40, 60], brasAr: [30, 60], jambeAv: [45, -85], jambeAr: [-25, -75] },
    // « Eurêka ! » : les deux bras au ciel.
    victoire: { torse: -8, tete: -14, brasAv: [170, 20], brasAr: [160, 30], jambeAv: [12, -6], jambeAr: [-10, -4] },
  },
  animations: {
    neutre: [
      { f: 0, p: {} }, { f: 2, p: { brasAv: [40, 110] } },
      { f: 4, p: { brasAv: [92, 0], torse: 12 } }, { f: 8, p: { brasAv: [88, 6], torse: 10 } }, { f: 16, p: {} },
    ],
    neutre2: [
      { f: 0, p: { brasAv: [70, 60] } }, { f: 4, p: { brasAv: [150, 40], torse: -4 } },
      { f: 7, p: { brasAv: [70, 0], torse: 18, bassin: [6, 4, 0] } }, { f: 12, p: { brasAv: [60, 10], torse: 14 } }, { f: 24, p: {} },
    ],
    cote: [
      { f: 0, p: {} }, { f: 7, p: { brasAv: [-40, 10], torse: -10, bassin: [-4, 2, 0] } },
      { f: 11, p: { brasAv: [80, 0], torse: 16, bassin: [6, 4, 0] } }, { f: 15, p: { brasAv: [110, 0], torse: 18 } },
      { f: 26, p: { brasAv: [60, 30] } }, { f: 34, p: {} },
    ],
    haut: [
      { f: 0, p: {} }, { f: 5, p: { brasAv: [150, 20], brasAr: [150, 20], torse: -6 } },
      { f: 8, p: { brasAv: [175, 0], brasAr: [172, 0], torse: -10, tete: -20, echelle: [0.96, 1.05] } },
      { f: 16, p: { brasAv: [170, 10], brasAr: [168, 10], torse: -8 } }, { f: 30, p: {} },
    ],
    bas: [
      { f: 0, p: {} }, { f: 6, p: { bassin: [0, 18, 0], torse: 30, brasAv: [120, 40], brasAr: [120, 40], jambeAv: [60, -90], jambeAr: [-30, -80] } },
      { f: 10, p: { bassin: [0, 22, 0], torse: 40, brasAv: [60, 0], brasAr: [70, 0], jambeAv: [60, -100], jambeAr: [-30, -90] } },
      { f: 22, p: { bassin: [0, 10, 0], torse: 15 } }, { f: 30, p: {} },
    ],
    air_neutre: [
      { f: 0, p: {} }, { f: 5, p: { brasAv: [95, 0], brasAr: [95, 0], rotation: 0 } },
      { f: 15, p: { brasAv: [95, 0], brasAr: [95, 0], rotation: 360 } }, { f: 30, p: { rotation: 360 } },
    ],
    air_bas: [
      { f: 0, p: {} }, { f: 6, p: { jambeAv: [60, -100], jambeAr: [50, -100], brasAv: [150, 30], brasAr: [160, 30] } },
      { f: 9, p: { jambeAv: [4, 0], jambeAr: [-4, 0], brasAv: [170, 10], brasAr: [165, 10], echelle: [0.92, 1.1] } },
      { f: 24, p: { jambeAv: [4, 0], jambeAr: [-4, 0] } }, { f: 38, p: {} },
    ],
    special_neutre: [
      { f: 0, p: {} }, { f: 7, p: { brasAv: [30, 120], torse: -8, bassin: [-4, 2, 0] } },
      { f: 10, p: { brasAv: [92, 0], torse: 14, bassin: [6, 3, 0] } }, { f: 18, p: { brasAv: [85, 10] } }, { f: 30, p: {} },
    ],
    special_cote: [
      { f: 0, p: {} }, { f: 8, p: { brasAv: [-60, 60], torse: -12, bassin: [-6, 2, 0] } },
      { f: 12, p: { brasAv: [140, 0], torse: 12, bassin: [6, 3, 0] } }, { f: 20, p: { brasAv: [110, 20] } }, { f: 34, p: {} },
    ],
    special_haut: [
      { f: 0, p: { bassin: [0, 14, 0], jambeAv: [45, -85], jambeAr: [-20, -75], brasAv: [40, 40], brasAr: [40, 40] } },
      { f: 4, p: { brasAv: [175, 0], brasAr: [170, 0], jambeAv: [5, -5], jambeAr: [-5, -5], echelle: [0.9, 1.12] } },
      { f: 18, p: { brasAv: [165, 10], brasAr: [160, 10] } }, { f: 42, p: {} },
    ],
    special_bas: [
      { f: 0, p: {} }, { f: 8, p: { bassin: [0, 20, 0], torse: 38, brasAv: [70, 10], jambeAv: [60, -90], jambeAr: [-30, -80] } },
      { f: 16, p: { bassin: [0, 18, 0], torse: 34, brasAv: [60, 20] } }, { f: 30, p: {} },
    ],
    ultime: [
      { f: 0, p: {} }, { f: 12, p: { brasAv: [175, 10], brasAr: [170, 10], torse: -12, tete: -24 } },
      { f: 24, p: { brasAv: [95, 0], brasAr: [92, 0], torse: 20, bassin: [8, 4, 0], echelle: [1.05, 0.96] } },
      { f: 50, p: { brasAv: [90, 5], brasAr: [88, 5], torse: 16 } }, { f: 70, p: {} },
    ],
  },
  effets: {
    neutre: { accessoire: "regle", trainee: ["poingAv"] },
    neutre2: { accessoire: "regle", trainee: ["poingAv"], textes: [{ f: 7, texte: "Δx", membre: "poingAv", taille: 30, math: true }] },
    cote: { accessoire: "pendule", trainee: ["poingAv"], couleurTrainee: 0xd9a441, textes: [{ f: 11, texte: "T ∝ √ℓ", membre: "torse", taille: 26, math: true }] },
    haut: { trainee: ["poingAv", "poingAr"], couleurTrainee: 0x5ad1ff, textes: [{ f: 8, texte: "U = RI", membre: "tete", taille: 28, couleur: 0x5ad1ff, math: true }] },
    bas: { onde: 10, textes: [{ f: 10, texte: "λ/2", membre: "poingAv", taille: 30, math: true }] },
    air_neutre: { trainee: ["poingAv", "poingAr"], couleurTrainee: 0x5ad1ff, textes: [{ f: 6, texte: "∇·E", membre: "torse", taille: 28, math: true }] },
    air_bas: { trainee: ["piedAv", "piedAr"], textes: [{ f: 9, texte: "g = 9,81", membre: "piedAv", taille: 26, math: true }] },
    special_neutre: { textes: [{ f: 10, texte: "e⁻", membre: "poingAv", taille: 32, couleur: 0x5ad1ff, math: true }] },
    special_cote: { accessoire: "fiole", trainee: ["poingAv"], textes: [{ f: 12, texte: "y = −x²", membre: "tete", taille: 26, math: true }] },
    special_haut: { textes: [{ f: 4, texte: "Δp", membre: "piedAv", taille: 32, math: true }] },
    special_bas: { accessoire: "aimant", textes: [{ f: 12, texte: "N · S", membre: "poingAv", taille: 26, math: true }] },
    ultime: { embleme: "∇", textes: [{ f: 20, texte: "E = mc²", membre: "tete", taille: 40, couleur: 0xb36bff, math: true }] },
  },
  entites: {
    electron: electron(),
    fiole: fiole(),
    flaque: flaque(),
    propulsion: explosion(70, [0xff9f43, 0xffe066], 350),
    aimant: aimant(),
    champ_magnetique: champMagnetique(),
    trou_noir: trouNoir(),
    explosion_trou_noir: explosion(190, [0xb36bff, 0xffffff], 550),
  },
};

