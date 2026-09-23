import { Container, FillGradient, Graphics, Text } from "pixi.js";
import type { Carte } from "../../noyau/carte";
import { SOUS_PIXELS } from "../../noyau/constantes";
import { POLICE } from "./couleurs";
import { POLICE_MATHS } from "./textes";

/*
 * Décors des cartes : un thème par carte (salle de classe, labo de
 * physique, toit d'usine), un thème neutre pour les autres. Tout est
 * dessiné une fois ; les plans lointains glissent moins vite que le
 * monde (parallaxe), et quelques détails bougent (horloge, néon, fumée).
 *
 * Règle de lisibilité : rien de ce qui dépasse d'une surface jouable ne
 * doit ressembler à un obstacle. Le fond reste sombre et désaturé ; les
 * surfaces où l'on marche ont un rebord clair.
 */

const px = (u: number) => u / SOUS_PIXELS;

type Cadre = { g: number; h: number; d: number; b: number };

export type Decor = {
  conteneur: Container;
  /** Plans lointains ; facteur 0 : fixe à l'écran, 1 : solidaire du monde. */
  plans: { conteneur: Container; facteur: number }[];
  centre: { x: number; y: number };
  animer(tempsMs: number): void;
};

type Atelier = {
  carte: Carte;
  cadre: Cadre;
  /** Nouveau plan, devant les précédents. */
  plan(facteur: number): Container;
  /** Le plan du monde lui-même (facteur 1). */
  monde: Container;
  anime(f: (tempsMs: number) => void): void;
};

type Theme = {
  /** Dégradé du fond, de haut en bas de l'arène. */
  ciel: readonly string[];
  fond?(a: Atelier): void;
  bloc(g: Graphics, x: number, y: number, l: number, h: number): void;
  plateforme(g: Graphics, x: number, y: number, l: number): void;
  /** Détails posés après les surfaces (toujours derrière les combattants). */
  devant?(a: Atelier): void;
};

/** Suite pseudo-aléatoire reproductible : le décor est le même à chaque partie. */
function hasard(graine: number): () => number {
  let s = graine >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function ecrire(
  c: Container, texte: string, x: number, y: number,
  style: { taille: number; couleur: number; police?: string; alpha?: number; gras?: boolean; italique?: boolean; espacement?: number; ancre?: number },
): Text {
  const t = new Text({
    text: texte,
    style: {
      fontFamily: style.police ?? POLICE_MATHS,
      fontSize: style.taille,
      fill: style.couleur,
      fontWeight: style.gras ? "900" : "400",
      fontStyle: style.italique ? "italic" : "normal",
      letterSpacing: style.espacement ?? 0,
    },
  });
  t.anchor.set(style.ancre ?? 0, 0.5);
  t.position.set(x, y);
  t.alpha = style.alpha ?? 1;
  c.addChild(t);
  return t;
}

// --- Salle d'entraînement : une salle de classe la nuit -------------------

const SALLE: Theme = {
  ciel: ["#1d2539", "#161c2d", "#0c1019"],
  fond(a) {
    const { g: G, h: H, d: D, b: B } = a.cadre;
    const mur = a.plan(0.85);
    const m = new Graphics();
    for (let x = G - 640; x < D + 640; x += 640) {
      m.rect(x, H - 1200, 56, B - H + 2400).fill({ color: 0x000000, alpha: 0.16 });
      m.rect(x + 56, H - 1200, 3, B - H + 2400).fill({ color: 0xffffff, alpha: 0.025 });
    }
    // Fenêtres sur la nuit, et leur lumière sur le mur.
    for (const x of [170, 2410]) {
      m.poly([x, 960, x + 220, 960, x + 340, 1110, x + 80, 1110]).fill({ color: 0x9fb8ff, alpha: 0.03 });
      m.rect(x, 540, 220, 420).fill(0x1b2a4c);
      m.rect(x, 540, 220, 170).fill({ color: 0x7f9ee6, alpha: 0.07 });
      m.circle(x + 160, 600, 16).fill({ color: 0xf1ead2, alpha: 0.5 });
      m.rect(x - 10, 530, 240, 440).stroke({ width: 12, color: 0x2a3148 });
      m.moveTo(x + 110, 540).lineTo(x + 110, 960).moveTo(x, 750).lineTo(x + 220, 750).stroke({ width: 6, color: 0x2a3148 });
    }
    mur.addChild(m);

    // Le tableau noir, et ce qu'il reste du dernier cours.
    const t = new Graphics();
    t.roundRect(740, 550, 1320, 420, 6).fill(0x55391f);
    t.rect(756, 566, 1288, 388).fill(0x1c392d);
    const r = hasard(7);
    for (let i = 0; i < 16; i++) t.ellipse(790 + r() * 1220, 600 + r() * 320, 60 + r() * 130, 10 + r() * 22).fill({ color: 0xffffff, alpha: 0.022 });
    t.rect(740, 966, 1320, 12).fill(0x6b4a2f);
    t.rect(900, 960, 28, 6).fill(0xf1f1ea).rect(962, 961, 18, 5).fill(0xffc9c9).rect(1702, 960, 30, 6).fill(0xf1f1ea);
    mur.addChild(t);
    const craie = { couleur: 0xeef3ea, alpha: 0.55 };
    ecrire(mur, "∑ 1/n² = π²/6", 800, 610, { ...craie, taille: 36 });
    ecrire(mur, "∀ε > 0, ∃N ∈ ℕ, ∀n ≥ N,", 800, 672, { ...craie, taille: 27 });
    ecrire(mur, "|uₙ − ℓ| ≤ ε", 830, 716, { ...craie, taille: 27 });
    ecrire(mur, "exp(iπ) + 1 = 0", 800, 790, { ...craie, taille: 30 });
    ecrire(mur, "det A ≠ 0  ⇔  A ∈ GLₙ(ℝ)", 800, 868, { ...craie, taille: 26 });
    ecrire(mur, "DS lundi !", 1740, 612, { ...craie, taille: 30, police: POLICE, italique: true, gras: true });
    const dessin = new Graphics();
    dessin.moveTo(1740, 634).lineTo(1905, 630).stroke({ width: 3, color: 0xeef3ea, alpha: 0.6 });
    // Un graphe : axes et sinusoïde.
    dessin.moveTo(1330, 780).lineTo(1640, 780).moveTo(1345, 640).lineTo(1345, 900).stroke({ width: 3, color: 0xeef3ea, alpha: 0.55 });
    for (let i = 0; i <= 60; i++) {
      const x = 1345 + i * 5;
      const y = 780 - Math.sin(i / 7) * 70;
      if (i === 0) dessin.moveTo(x, y);
      else dessin.lineTo(x, y);
    }
    dessin.stroke({ width: 3, color: 0xffe28a, alpha: 0.6 });
    // Une taupe à la craie : l'élève de prépa, mascotte du jeu.
    const tx = 1870;
    const ty = 820;
    dessin.ellipse(tx, ty, 62, 42).stroke({ width: 3, color: 0xeef3ea, alpha: 0.6 });
    dessin.circle(tx + 58, ty - 6, 9).stroke({ width: 3, color: 0xeef3ea, alpha: 0.6 });
    dessin.circle(tx + 24, ty - 16, 3).fill({ color: 0xeef3ea, alpha: 0.7 });
    dessin.moveTo(tx - 20, ty + 40).lineTo(tx - 30, ty + 54).moveTo(tx + 20, ty + 40).lineTo(tx + 28, ty + 54)
      .moveTo(tx + 60, ty + 2).lineTo(tx + 82, ty + 10).moveTo(tx + 60, ty - 12).lineTo(tx + 84, ty - 18)
      .stroke({ width: 2.5, color: 0xeef3ea, alpha: 0.55 });
    // Mortier de diplômé sur la tête.
    dessin.poly([tx - 8, ty - 50, tx + 40, ty - 60, tx + 56, ty - 46, tx + 8, ty - 36]).stroke({ width: 3, color: 0xeef3ea, alpha: 0.6 });
    mur.addChild(dessin);
    ecrire(mur, "Taupe Fighter", tx - 40, ty + 84, { ...craie, taille: 22, police: POLICE, italique: true, alpha: 0.6 });

    // L'horloge : l'heure du DS, et une trotteuse qui tourne vraiment.
    const cx = 1400;
    const cy = 470;
    const horloge = new Graphics();
    horloge.circle(cx, cy, 38).fill(0xdcd8cc).stroke({ width: 7, color: 0x2a3148 });
    for (let i = 0; i < 12; i++) {
      const an = (i / 12) * Math.PI * 2;
      horloge.moveTo(cx + Math.cos(an) * 28, cy + Math.sin(an) * 28).lineTo(cx + Math.cos(an) * 33, cy + Math.sin(an) * 33);
    }
    horloge.stroke({ width: 2.5, color: 0x2a3148 });
    horloge.moveTo(cx, cy).lineTo(cx - 17, cy + 10).moveTo(cx, cy).lineTo(cx, cy - 28).stroke({ width: 4, color: 0x151a28, cap: "round" });
    mur.addChild(horloge);
    const trotteuse = new Graphics().moveTo(0, 6).lineTo(0, -30).stroke({ width: 2, color: 0xd6453d });
    trotteuse.position.set(cx, cy);
    mur.addChild(trotteuse);
    a.anime((t) => {
      trotteuse.rotation = Math.floor(t / 1000) * (Math.PI / 30);
    });
  },
  bloc(g, x, y, l, h) {
    // Estrade : face à panneaux, plancher de bois.
    g.rect(x, y, l, h).fill(0x262c42);
    const n = Math.max(1, Math.floor((l - 40) / 210));
    const w = (l - 40 - (n - 1) * 16) / n;
    for (let i = 0; i < n; i++) g.rect(x + 20 + i * (w + 16), y + 44, w, h - 78).stroke({ width: 3, color: 0x1b2031 });
    g.rect(x, y + h - 10, l, 10).fill(0x171b2a);
    g.rect(x, y + 20, l, 10).fill({ color: 0x000000, alpha: 0.28 });
    g.rect(x - 8, y, l + 16, 20).fill(0x94653d);
    for (let px0 = x + 60; px0 < x + l; px0 += 120) g.rect(px0, y + 5, 2, 15).fill({ color: 0x000000, alpha: 0.18 });
    g.rect(x - 8, y, l + 16, 4).fill(0xd6a26b);
  },
  plateforme(g, x, y, l) {
    for (const bx of [x + 30, x + l - 42]) g.poly([bx, y + 14, bx + 12, y + 14, bx + 12, y + 34]).fill(0x4e5569);
    g.roundRect(x, y, l, 14, 4).fill(0x85573a);
    g.rect(x + 4, y + 14, l - 8, 5).fill({ color: 0x000000, alpha: 0.25 });
    g.rect(x, y, l, 4).fill(0xd09a64);
  },
  devant(a) {
    // Pochoir sur la face de la grande estrade.
    const s = [...a.carte.solides].sort((p, q) => (q.droite - q.gauche) - (p.droite - p.gauche))[0];
    if (!s) return;
    ecrire(a.monde, "MP2I", px(s.gauche + s.droite) / 2, px(s.haut) + 140, {
      taille: 120, couleur: 0xffffff, police: POLICE, gras: true, alpha: 0.06, espacement: 36, ancre: 0.5,
    });
  },
};

// --- Labo de physique -----------------------------------------------------

const COULEURS_FIOLES = [0x3fcf5e, 0x5ad1ff, 0xff6bd6, 0xffc24a, 0xb36bff, 0xff7a59];

function fiole(g: Graphics, x: number, y: number, type: number, couleur: number) {
  const verre = { width: 2, color: 0xbfe6f0, alpha: 0.55 };
  if (type === 0) {
    // Erlenmeyer.
    g.poly([x - 18, y, x + 18, y, x + 5, y - 30, x + 5, y - 44, x - 5, y - 44, x - 5, y - 30]).fill({ color: 0xbfe6f0, alpha: 0.08 }).stroke(verre);
    g.poly([x - 16, y - 2, x + 16, y - 2, x + 9, y - 18, x - 9, y - 18]).fill({ color: couleur, alpha: 0.75 });
  } else if (type === 1) {
    // Ballon à fond rond.
    g.circle(x, y - 17, 17).fill({ color: couleur, alpha: 0.6 }).stroke(verre);
    g.rect(x - 5, y - 52, 10, 20).fill({ color: 0xbfe6f0, alpha: 0.08 }).stroke(verre);
    g.circle(x - 6, y - 22, 4).fill({ color: 0xffffff, alpha: 0.35 });
  } else {
    // Tubes à essai sur leur support.
    g.rect(x - 22, y - 16, 44, 6).fill(0x5b4636);
    for (let i = 0; i < 3; i++) {
      const tx = x - 14 + i * 14;
      g.roundRect(tx - 4, y - 44, 8, 42, 4).fill({ color: 0xbfe6f0, alpha: 0.1 }).stroke({ width: 1.5, color: 0xbfe6f0, alpha: 0.5 });
      g.roundRect(tx - 3, y - 24 + i * 4, 6, 20 - i * 4, 3).fill({ color: COULEURS_FIOLES[(i * 2 + 1) % COULEURS_FIOLES.length], alpha: 0.8 });
    }
  }
}

function tableauPeriodique(c: Container, x: number, y: number) {
  const g = new Graphics();
  g.roundRect(x, y, 420, 260, 6).fill(0x14222b).stroke({ width: 4, color: 0x2b3c47 });
  const cote = 19;
  const x0 = x + 39;
  const y0 = y + 44;
  const case_ = (col: number, lig: number, couleur: number) => g.rect(x0 + (col - 1) * cote, y0 + (lig - 1) * cote, cote - 3, cote - 3).fill({ color: couleur, alpha: 0.7 });
  const bloc = (col: number) => (col <= 2 ? 0xff6b6b : col <= 12 ? 0x5ab0ff : col === 18 ? 0xb388ff : 0xffd166);
  for (let lig = 1; lig <= 7; lig++) {
    for (let col = 1; col <= 18; col++) {
      const present = lig === 1 ? col === 1 || col === 18 : lig <= 3 ? col <= 2 || col >= 13 : true;
      if (present) case_(col, lig, lig === 1 && col === 1 ? 0xe6e6e6 : bloc(col));
    }
  }
  for (let lig = 0; lig < 2; lig++) for (let col = 3; col <= 17; col++) {
    g.rect(x0 + (col - 1) * cote, y0 + 7.5 * cote + lig * cote, cote - 3, cote - 3).fill({ color: 0x7ae582, alpha: 0.7 });
  }
  c.addChild(g);
  ecrire(c, "TABLEAU PÉRIODIQUE", x + 210, y + 22, { taille: 15, couleur: 0xcfe4ee, police: POLICE, gras: true, espacement: 3, ancre: 0.5, alpha: 0.8 });
}

const LABO: Theme = {
  ciel: ["#122430", "#0d1a22", "#070c11"],
  fond(a) {
    const { g: G, h: H, d: D, b: B } = a.cadre;
    // Carrelage.
    const mur = a.plan(0.85);
    const carreaux = new Graphics();
    for (let x = G - 800; x <= D + 800; x += 56) carreaux.moveTo(x, H - 800).lineTo(x, B + 800);
    for (let y = H - 800; y <= B + 800; y += 56) carreaux.moveTo(G - 800, y).lineTo(D + 800, y);
    carreaux.stroke({ width: 2, color: 0xbfe9f5, alpha: 0.045 });
    carreaux.rect(G - 800, 1000, D - G + 1600, B - 1000 + 800).fill({ color: 0x000000, alpha: 0.18 });
    carreaux.rect(G - 800, 994, D - G + 1600, 6).fill({ color: 0x3aa0b5, alpha: 0.25 });
    mur.addChild(carreaux);

    tableauPeriodique(mur, 1290, 450);

    // Tableau blanc de physique.
    const tb = new Graphics();
    tb.roundRect(2060, 520, 380, 230, 4).fill(0x9eabb3).stroke({ width: 6, color: 0x55616a });
    tb.rect(2080, 752, 340, 8).fill(0x55616a);
    mur.addChild(tb);
    ecrire(mur, "E = mc²", 2090, 568, { taille: 36, couleur: 0x2f5fbf });
    ecrire(mur, "F = q(E + v ∧ B)", 2090, 630, { taille: 26, couleur: 0xb8322b });
    ecrire(mur, "λ = h / p", 2090, 690, { taille: 28, couleur: 0x1d7a48 });

    // Atome de Bohr, électrons en orbite.
    const atome = new Container();
    atome.position.set(740, 660);
    atome.alpha = 0.55;
    const noyau = new Graphics();
    for (const [dx, dy, c] of [[-6, -4, 0xff6b6b], [6, -2, 0x5ab0ff], [0, 6, 0xff6b6b], [-4, 5, 0x5ab0ff]] as const) noyau.circle(dx, dy, 7).fill(c);
    const electrons: Graphics[] = [];
    for (let i = 0; i < 3; i++) {
      const orbite = new Container();
      orbite.rotation = (i * Math.PI) / 3;
      orbite.addChild(new Graphics().ellipse(0, 0, 110, 38).stroke({ width: 2.5, color: 0x5ad1ff, alpha: 0.45 }));
      const e = new Graphics().circle(0, 0, 6).fill(0x9fe8ff);
      orbite.addChild(e);
      electrons.push(e);
      atome.addChild(orbite);
    }
    atome.addChild(noyau);
    mur.addChild(atome);

    // Étagères de verrerie, de part et d'autre.
    const r = hasard(11);
    const etageres = new Graphics();
    for (const x0 of [70, 2630]) {
      for (const y0 of [840, 960]) {
        etageres.rect(x0, y0, 300, 8).fill(0x2a3740);
        for (let i = 0; i < 4; i++) fiole(etageres, x0 + 38 + i * 74, y0, Math.floor(r() * 3), COULEURS_FIOLES[Math.floor(r() * COULEURS_FIOLES.length)]);
      }
    }
    etageres.alpha = 0.7;
    mur.addChild(etageres);

    // Panneau au-dessus du vide.
    const panneau = new Graphics();
    panneau.poly([1500, 880, 1540, 950, 1460, 950]).fill(0xf2c14e).stroke({ width: 4, color: 0x1a1a1a, join: "round" });
    panneau.rect(1497, 900, 6, 28).fill(0x1a1a1a).circle(1500, 938, 3.5).fill(0x1a1a1a);
    mur.addChild(panneau);
    ecrire(mur, "ATTENTION : VIDE", 1500, 972, { taille: 14, couleur: 0xf2c14e, police: POLICE, gras: true, espacement: 2, ancre: 0.5, alpha: 0.75 });

    // Néons du plafond ; celui du milieu grésille.
    const plafond = a.plan(0.9);
    const neons: Graphics[] = [];
    for (const x of [500, 1500, 2500]) {
      const lueur = new Graphics().rect(x - 190, 360, 380, 56).fill({ color: 0xdffcff, alpha: 0.05 });
      const tube = new Graphics().rect(x - 160, 380, 320, 12).fill(0xeaffff);
      plafond.addChild(lueur, new Graphics().rect(x - 170, 374, 340, 6).fill(0x4b5a63), tube);
      neons.push(lueur, tube);
    }
    a.anime((t) => {
      const phase = t % 6400;
      const vacille = phase < 420 ? (Math.floor(phase / 60) % 2 === 0 ? 0.25 : 1) : 1;
      neons[2].alpha = vacille;
      neons[3].alpha = vacille;
      electrons.forEach((e, i) => {
        const an = t / 700 + (i * Math.PI * 2) / 3;
        e.position.set(Math.cos(an) * 110, Math.sin(an) * 38);
      });
    });
  },
  bloc(g, x, y, l, h) {
    // Paillasse : caissons, plan de travail noir, robinet col de cygne.
    g.rect(x, y + 20, l, h - 20).fill(0x1f3a45);
    const n = Math.max(1, Math.round(l / 150));
    const w = l / n;
    for (let i = 0; i < n; i++) {
      g.rect(x + i * w + 8, y + 38, w - 16, h - 76).stroke({ width: 3, color: 0x2c5361 });
      g.rect(x + i * w + w / 2 - 14, y + 52, 28, 5).fill(0x9fb0bd);
    }
    g.rect(x, y + h - 18, l, 18).fill(0x0f1a20);
    const cx = x + l / 2;
    g.moveTo(cx, y).lineTo(cx, y - 38).quadraticCurveTo(cx, y - 52, cx + 14, y - 52).lineTo(cx + 22, y - 44)
      .stroke({ width: 5, color: 0x8e9aa6, cap: "round", join: "round" });
    g.rect(cx - 9, y - 6, 18, 6).fill(0x5b6873);
    g.roundRect(x - 12, y, l + 24, 22, 4).fill(0x15181d);
    g.rect(x - 12, y, l + 24, 3).fill(0x4a5563);
  },
  plateforme(g, x, y, l) {
    for (const bx of [x + 24, x + l - 36]) g.poly([bx, y + 10, bx + 12, y + 10, bx + 12, y + 30]).fill(0x4d5a66);
    g.rect(x, y, l, 10).fill(0x7d8b98);
    g.rect(x + 3, y + 10, l - 6, 4).fill({ color: 0x000000, alpha: 0.3 });
    g.rect(x, y, l, 3).fill(0xd2dde6);
  },
};

// --- Toit de l'usine, la nuit ---------------------------------------------

function immeubles(g: Graphics, r: () => number, de: number, a: number, sommet: [number, number], couleur: number, fenetres: number) {
  for (let x = de; x < a;) {
    const l = 90 + r() * 170;
    const y = sommet[0] + r() * (sommet[1] - sommet[0]);
    g.rect(x, y, l, 2600).fill(couleur);
    for (let fy = y + 26; fy < y + 900; fy += 34) {
      for (let fx = x + 14; fx < x + l - 16; fx += 26) {
        if (r() < fenetres) g.rect(fx, fy, 10, 14).fill({ color: r() < 0.8 ? 0xffd98a : 0x9fd3ff, alpha: 0.18 + r() * 0.3 });
      }
    }
    x += l + (r() < 0.3 ? 20 + r() * 40 : 0);
  }
}

const TOIT: Theme = {
  ciel: ["#060919", "#0f1233", "#231a45", "#3b2447"],
  fond(a) {
    const { g: G, h: H, d: D, b: B } = a.cadre;
    const cx = (G + D) / 2;
    const cy = (H + B) / 2;
    const r = hasard(23);

    // Étoiles, en deux groupes qui scintillent à contretemps.
    const ciel = a.plan(0.03);
    const etoiles = [new Graphics(), new Graphics()];
    for (let i = 0; i < 180; i++) {
      const e = etoiles[i % 2];
      e.circle(G - 600 + r() * (D - G + 1200), H - 700 + r() * 1400, 0.8 + r() * 1.6).fill({ color: 0xffffff, alpha: 0.25 + r() * 0.6 });
    }
    ciel.addChild(...etoiles);

    // La lune.
    const lune = new Graphics();
    const lx = cx + 560;
    const ly = cy - 300;
    lune.circle(lx, ly, 210).fill({ color: 0xf1ead2, alpha: 0.03 });
    lune.circle(lx, ly, 130).fill({ color: 0xf1ead2, alpha: 0.05 });
    lune.circle(lx, ly, 62).fill(0xefe7cc);
    lune.circle(lx - 18, ly - 10, 12).fill(0xd9cfb0).circle(lx + 20, ly + 16, 8).fill(0xd9cfb0).circle(lx + 4, ly - 30, 6).fill(0xd9cfb0);
    ciel.addChild(lune);

    // La ville : deux rangs d'immeubles.
    const loin = a.plan(0.2);
    const villeLoin = new Graphics();
    immeubles(villeLoin, r, G - 1600, D + 1600, [cy + 40, cy + 200], 0x161838, 0.12);
    loin.addChild(villeLoin);

    const pres = a.plan(0.45);
    const villePres = new Graphics();
    immeubles(villePres, r, G - 1200, D + 1200, [cy + 150, cy + 330], 0x0d0e24, 0.08);
    // Château d'eau et antenne.
    const ex = cx - 900;
    const ey = cy + 40;
    villePres.moveTo(ex - 50, ey + 60).lineTo(ex - 70, ey + 260).moveTo(ex + 50, ey + 60).lineTo(ex + 70, ey + 260)
      .moveTo(ex - 60, ey + 160).lineTo(ex + 60, ey + 160).moveTo(ex - 58, ey + 150).lineTo(ex + 66, ey + 250)
      .stroke({ width: 7, color: 0x0d0e24 });
    villePres.roundRect(ex - 80, ey - 40, 160, 110, 14).fill(0x0d0e24);
    villePres.poly([ex - 90, ey - 36, ex, ey - 90, ex + 90, ey - 36]).fill(0x0d0e24);
    const ax = cx + 820;
    const ay = cy - 150;
    villePres.poly([ax - 44, cy + 400, ax, ay, ax + 44, cy + 400]).stroke({ width: 5, color: 0x0d0e24 });
    for (let y = ay + 60; y < cy + 400; y += 60) villePres.moveTo(ax - 44 * ((y - ay) / (cy + 400 - ay)), y).lineTo(ax + 44 * ((y - ay) / (cy + 400 - ay)), y);
    villePres.stroke({ width: 3, color: 0x0d0e24 });
    pres.addChild(villePres);
    const balise = new Graphics().circle(0, 0, 14).fill({ color: 0xff3b3b, alpha: 0.2 }).circle(0, 0, 5).fill(0xff4d4d);
    balise.position.set(ax, ay);
    pres.addChild(balise);

    a.anime((t) => {
      balise.alpha = t % 1600 < 800 ? 1 : 0.15;
      etoiles[0].alpha = 0.75 + 0.25 * Math.sin(t / 900);
      etoiles[1].alpha = 0.75 - 0.25 * Math.sin(t / 900);
    });

    // Sous les toits, les immeubles se perdent dans l'obscurité.
    const ombre = new Graphics();
    const fondu = new FillGradient({
      type: "linear", start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: "local",
      colorStops: [{ offset: 0, color: "rgba(24,26,38,0.95)" }, { offset: 1, color: "rgba(24,26,38,0)" }],
    });
    for (const s of a.carte.solides) {
      const [x, l, h] = [px(s.gauche), px(s.droite - s.gauche), px(s.bas - s.haut)];
      if (l < h) continue;
      ombre.rect(x + 10, px(s.bas), l - 20, 480).fill(fondu);
    }
    a.monde.addChild(ombre);
  },
  bloc(g, x, y, l, h) {
    if (l < h) {
      // Cheminée de briques.
      g.rect(x, y, l, h).fill(0x6e3527);
      for (let rang = 0, yy = y + 14; yy < y + h; yy += 14, rang++) {
        g.moveTo(x, yy).lineTo(x + l, yy);
        for (let xx = x + (rang % 2 ? 18 : 0); xx < x + l; xx += 36) g.moveTo(xx, yy).lineTo(xx, yy + 14);
      }
      g.stroke({ width: 2, color: 0x3f1d15 });
      g.rect(x, y, 10, h).fill({ color: 0xffffff, alpha: 0.05 });
      g.rect(x - 8, y - 4, l + 16, 16).fill(0x3d4152);
      g.rect(x - 8, y - 4, l + 16, 3).fill(0x8a93ad);
      return;
    }
    // Dernier étage de l'usine : parapet, joints, fenêtres.
    g.rect(x, y, l, h).fill(0x262937);
    const r = hasard(Math.round(x * 7 + y));
    for (let fy = y + 60; fy + 70 < y + h; fy += 120) {
      for (let fx = x + 50; fx + 50 < x + l; fx += 110) {
        const allumee = r() < 0.18;
        g.rect(fx, fy, 50, 70).fill(allumee ? 0x8a6a3a : 0x11131d);
        if (allumee) g.rect(fx + 4, fy + 4, 42, 30).fill({ color: 0xffcf6b, alpha: 0.35 });
        g.rect(fx - 4, fy - 4, 58, 78).stroke({ width: 3, color: 0x1a1c27 });
        g.moveTo(fx + 25, fy).lineTo(fx + 25, fy + 70).stroke({ width: 2, color: 0x1a1c27 });
      }
    }
    for (let yy = y + 40; yy < y + h - 10; yy += 120) g.rect(x, yy, l, 3).fill({ color: 0x000000, alpha: 0.25 });
    g.rect(x, y + h - 8, l, 8).fill(0x151722);
    g.rect(x - 6, y, l + 12, 16).fill(0x4a4f63);
    g.rect(x - 6, y + 16, l + 12, 6).fill({ color: 0x000000, alpha: 0.3 });
    g.rect(x - 6, y, l + 12, 3).fill(0x8a93ad);
  },
  plateforme(g, x, y, l) {
    // Passerelle de métal ajouré.
    for (const [bx, sens] of [[x + 22, 1], [x + l - 22, -1]] as const) g.moveTo(bx, y + 12).lineTo(bx + 16 * sens, y + 36);
    g.stroke({ width: 4, color: 0x2b3040 });
    g.rect(x, y, l, 12).fill(0x394054);
    for (let xx = x + 8; xx < x + l - 8; xx += 12) g.moveTo(xx, y + 4).lineTo(xx + 6, y + 11);
    g.stroke({ width: 2, color: 0x0d0f18, alpha: 0.5 });
    g.rect(x, y, l, 3).fill(0x8a93ad);
  },
  devant(a) {
    // La cheminée fume.
    const s = a.carte.solides.find((b) => b.droite - b.gauche < b.bas - b.haut);
    if (!s) return;
    const x = px(s.gauche + s.droite) / 2;
    const y = px(s.haut) - 6;
    const bouffees = Array.from({ length: 9 }, () => a.monde.addChild(
      new Graphics().circle(0, 0, 22).fill({ color: 0x8a8fa3, alpha: 0.5 }).circle(0, 0, 13).fill({ color: 0x9aa0b4, alpha: 0.6 })));
    a.anime((t) => {
      bouffees.forEach((b, i) => {
        const k = ((t / 4200) + i / bouffees.length) % 1;
        b.position.set(x + Math.sin(k * 5 + i) * 12 + k * 90, y - k * 260);
        b.scale.set(0.35 + k * 2);
        b.alpha = 0.3 * (1 - k) * Math.min(1, k * 5);
      });
    });
  },
};

// --- Thème neutre (cartes sans décor dédié) -------------------------------

const NEUTRE: Theme = {
  ciel: ["#161b2e", "#0f1320", "#07090f"],
  fond(a) {
    const { g: G, h: H, d: D, b: B } = a.cadre;
    const grille = new Graphics();
    for (let x = Math.ceil(G / 100) * 100; x <= D; x += 100) grille.moveTo(x, H).lineTo(x, B);
    for (let y = Math.ceil(H / 100) * 100; y <= B; y += 100) grille.moveTo(G, y).lineTo(D, y);
    grille.stroke({ width: 1, color: 0x8aa0ff, alpha: 0.035 });
    a.monde.addChild(grille);
  },
  bloc(g, x, y, l, h) {
    g.roundRect(x, y, l, h, 10).fill(0x232a3d);
    g.roundRect(x, y, l, 10, 5).fill(0x46507a);
    g.rect(x + 8, y + 10, l - 16, 2).fill({ color: 0xffffff, alpha: 0.06 });
  },
  plateforme(g, x, y, l) {
    g.roundRect(x, y, l, 12, 6).fill(0x2c3450);
    g.roundRect(x, y, l, 4, 2).fill(0x6c7bb8);
  },
};

const THEMES: Readonly<Record<string, Theme>> = { "salle-entrainement": SALLE, labo: LABO, toit: TOIT };

export function creerDecor(carte: Carte): Decor {
  const theme = THEMES[carte.id] ?? NEUTRE;
  const l = carte.limites;
  const cadre: Cadre = { g: px(l.gauche), h: px(l.haut), d: px(l.droite), b: px(l.bas) };
  const conteneur = new Container();
  const plans: Decor["plans"] = [];
  const animations: ((t: number) => void)[] = [];

  // Fond : dégradé sur la hauteur de l'arène, prolongé par ses couleurs extrêmes.
  const ciel = new FillGradient({
    type: "linear", start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: "local",
    colorStops: theme.ciel.map((color, i) => ({ offset: i / (theme.ciel.length - 1), color })),
  });
  const [G, H, L, Hh] = [cadre.g - 4000, cadre.h, cadre.d - cadre.g + 8000, cadre.b - cadre.h];
  conteneur.addChild(new Graphics()
    .rect(G, H - 3000, L, 3000).fill(theme.ciel[0])
    .rect(G, H + Hh, L, 3000).fill(theme.ciel[theme.ciel.length - 1])
    .rect(G, H, L, Hh).fill(ciel));

  const arriere = new Container();
  const monde = new Container();
  const atelier: Atelier = {
    carte, cadre, monde,
    plan(facteur) {
      const c = new Container();
      arriere.addChild(c);
      plans.push({ conteneur: c, facteur });
      return c;
    },
    anime(f) {
      animations.push(f);
    },
  };
  conteneur.addChild(arriere, monde);
  theme.fond?.(atelier);

  const surfaces = new Graphics();
  for (const s of carte.solides) theme.bloc(surfaces, px(s.gauche), px(s.haut), px(s.droite - s.gauche), px(s.bas - s.haut));
  for (const p of carte.plateformes) theme.plateforme(surfaces, px(p.gauche), px(p.y), px(p.droite - p.gauche));
  monde.addChild(surfaces);
  theme.devant?.(atelier);

  return {
    conteneur,
    plans,
    centre: { x: (cadre.g + cadre.d) / 2, y: (cadre.h + cadre.b) / 2 },
    animer(t) {
      for (const f of animations) f(t);
    },
  };
}

/** Parallaxe : chaque plan lointain suit une fraction du mouvement de la caméra. */
export function placerDecor(decor: Decor, cameraX: number, cameraY: number): void {
  for (const p of decor.plans) {
    p.conteneur.position.set((cameraX - decor.centre.x) * (1 - p.facteur), (cameraY - decor.centre.y) * (1 - p.facteur));
  }
}
