import { test } from "node:test";
import assert from "node:assert/strict";
import { ARENE_BAC_A_SABLE, creerMondeBacASable } from "../noyau/bac-a-sable";
import type { Carte } from "../noyau/carte";
import { chevauche } from "../noyau/collisions";
import {
  avancerCombattant, boiteDe, creerCombattant, type Combattant, type StatsCombattant,
} from "../noyau/combattant";
import { DASH, DROITE, GAUCHE, SAUT, type Entree } from "../noyau/entrees";
import { avancerMonde, empreinteMonde } from "../noyau/monde";

// Valeurs rondes, indépendantes du mannequin du prototype : régler la
// sensation de jeu ne doit pas casser ces tests.
const STATS: StatsCombattant = {
  largeur: 4000, hauteur: 8000,
  vitesseSol: 800, accelerationSol: 200, freinageSol: 200,
  vitesseAir: 600, accelerationAir: 100, freinageAir: 50,
  gravite: 100, vitesseChuteMax: 2000,
  impulsionSaut: 2000, impulsionDoubleSaut: 1500, sautsAeriens: 1,
  dashVitesse: 3000, dashDuree: 10, dashRecharge: 20, dashsAeriens: 1,
};

const SOL = 100_000; // sommet du sol
const LOIN = 10_000_000;
const PLAINE: Carte = {
  limites: { gauche: -LOIN, haut: -LOIN, droite: LOIN, bas: LOIN },
  solides: [{ gauche: -LOIN, haut: SOL, droite: LOIN, bas: LOIN }],
  apparitions: [{ x: 0, y: SOL }],
};
const VIDE: Carte = { ...PLAINE, solides: [] };

function avec(...solides: Carte["solides"]): Carte {
  return { ...PLAINE, solides: [...PLAINE.solides, ...solides] };
}

function jouer(c: Combattant, carte: Carte, entree: Entree, ticks = 1): void {
  for (let i = 0; i < ticks; i++) avancerCombattant(c, entree, carte);
}

/** Combattant posé sur le sol de `carte` (un tick d'attente pour s'y poser). */
function pose(carte = PLAINE, stats = STATS): Combattant {
  const c = creerCombattant(stats, 0, SOL);
  jouer(c, carte, 0);
  assert.equal(c.auSol, true);
  return c;
}

test("au repos, le combattant reste posé exactement sur le sol", () => {
  const c = pose();
  jouer(c, PLAINE, 0, 100);
  assert.deepEqual([c.x, c.y, c.vx, c.vy, c.auSol], [0, SOL, 0, 0, true]);
});

test("la gravité fait tomber jusqu'au sol, à vitesse plafonnée, sans jamais l'enfoncer", () => {
  const c = creerCombattant(STATS, 0, SOL - 500_000);
  for (let t = 0; !c.auSol; t++) {
    assert.ok(t < 1000, "le combattant n'atterrit jamais");
    jouer(c, PLAINE, 0);
    assert.ok(c.vy <= STATS.vitesseChuteMax);
    assert.ok(c.y <= SOL);
  }
  assert.equal(c.y, SOL);
  assert.equal(c.vy, 0);
});

test("se déplacer accélère jusqu'à la vitesse maximale ; relâcher freine jusqu'à l'arrêt", () => {
  const c = pose();
  jouer(c, PLAINE, DROITE);
  assert.equal(c.vx, 200);
  jouer(c, PLAINE, DROITE, 20);
  assert.equal(c.vx, STATS.vitesseSol);
  assert.equal(c.orientation, 1);

  const x = c.x;
  jouer(c, PLAINE, 0, 4);
  assert.equal(c.vx, 0);
  assert.equal(c.x - x, 600 + 400 + 200);

  jouer(c, PLAINE, GAUCHE);
  assert.equal(c.vx, -200);
  assert.equal(c.orientation, -1);
});

test("un saut monte de 19 000 unités et retombe au même endroit en 39 ticks", () => {
  const c = pose();
  let plusHaut = c.y;
  let ticks = 0;
  // Touche tenue du début à la fin : un seul saut, aucun double saut.
  do {
    jouer(c, PLAINE, SAUT);
    plusHaut = Math.min(plusHaut, c.y);
    ticks++;
  } while (!c.auSol);
  assert.equal(SOL - plusHaut, 19_000); // Σ (2000 − 100k), k = 1..19
  assert.equal(ticks, 39);
  assert.equal(c.y, SOL);

  jouer(c, PLAINE, SAUT, 10);
  assert.equal(c.auSol, true, "tenir la touche au sol ne relance pas de saut");
});

test("le double saut ne sert qu'une fois en l'air et se recharge au sol", () => {
  const c = pose();
  jouer(c, PLAINE, SAUT);
  jouer(c, PLAINE, 0, 19);
  assert.equal(c.vy, 0, "apogée du premier saut");

  jouer(c, PLAINE, SAUT);
  assert.equal(c.sautsRestants, 0);
  let plusHaut = c.y;
  while (c.vy < 0) {
    jouer(c, PLAINE, 0);
    plusHaut = Math.min(plusHaut, c.y);
  }
  assert.equal(SOL - plusHaut, 19_000 + 10_500); // + Σ (1500 − 100k), k = 1..14

  const vy = c.vy;
  jouer(c, PLAINE, 0);
  jouer(c, PLAINE, SAUT);
  assert.equal(c.vy, vy + 2 * STATS.gravite, "un troisième saut est refusé");

  while (!c.auSol) jouer(c, PLAINE, 0);
  assert.equal(c.sautsRestants, 1);
});

test("un dash parcourt exactement vitesse × durée, sans gravité, du côté regardé", () => {
  const c = pose();
  jouer(c, PLAINE, DASH);
  jouer(c, PLAINE, 0, STATS.dashDuree - 1);
  assert.equal(c.x, STATS.dashVitesse * STATS.dashDuree);
  assert.equal(c.y, SOL);
  assert.equal(c.dash, 0);
  assert.equal(c.recharge, STATS.dashRecharge);

  const g = pose();
  g.orientation = -1;
  jouer(g, PLAINE, DASH, STATS.dashDuree);
  assert.equal(g.x, -STATS.dashVitesse * STATS.dashDuree);

  const d = pose();
  jouer(d, PLAINE, DASH | GAUCHE, STATS.dashDuree);
  assert.equal(d.x, -STATS.dashVitesse * STATS.dashDuree, "la direction tenue l'emporte");

  const a = pose();
  jouer(a, PLAINE, SAUT);
  jouer(a, PLAINE, 0, 19);
  const y = a.y;
  jouer(a, PLAINE, DASH, STATS.dashDuree);
  assert.equal(a.y, y, "en l'air, le dash est horizontal");
});

test("la recharge sépare deux dashs ; en l'air, un seul dash avant de retoucher le sol", () => {
  const c = pose();
  jouer(c, PLAINE, DASH);
  jouer(c, PLAINE, 0, STATS.dashDuree - 1);
  jouer(c, PLAINE, DASH);
  assert.equal(c.dash, 0, "refusé pendant la recharge");
  jouer(c, PLAINE, 0, STATS.dashRecharge - 2);
  assert.equal(c.recharge, 1);
  jouer(c, PLAINE, DASH);
  assert.ok(c.dash > 0, "accepté dès la fin de la recharge");

  const v = creerCombattant(STATS, 0, 0);
  jouer(v, VIDE, DASH);
  assert.equal(v.dashsRestants, 0);
  jouer(v, VIDE, 0, 40);
  jouer(v, VIDE, DASH);
  assert.equal(v.dash, 0, "second dash aérien refusé");

  const p = creerCombattant(STATS, 0, SOL - 50_000);
  jouer(p, PLAINE, DASH);
  while (!p.auSol) jouer(p, PLAINE, 0);
  assert.equal(p.dashsRestants, 1, "rendu à l'atterrissage");
});

test("sauter interrompt le dash", () => {
  const c = pose();
  jouer(c, PLAINE, DASH);
  jouer(c, PLAINE, 0, 2);
  jouer(c, PLAINE, SAUT);
  assert.equal(c.dash, 0);
  assert.equal(c.recharge, STATS.dashRecharge);
  assert.ok(c.vy < 0);
});

test("un mur arrête le combattant exactement contre sa face", () => {
  const carte = avec({ gauche: 10_000, haut: 0, droite: 12_000, bas: SOL });
  const c = pose(carte);
  jouer(c, carte, DROITE, 60);
  assert.equal(boiteDe(c).droite, 10_000);
  assert.equal(c.vx, 0);
});

test("aucune vitesse ne permet de traverser un mur, même épais d'une unité", () => {
  const carte = avec({ gauche: 50_000, haut: 0, droite: 50_001, bas: SOL });
  const c = pose(carte, { ...STATS, dashVitesse: 1_000_000 });
  jouer(c, carte, DASH);
  assert.equal(boiteDe(c).droite, 50_000);
});

test("un plafond arrête la montée, puis le combattant retombe", () => {
  const carte = avec({ gauche: -100_000, haut: SOL - 20_000, droite: 100_000, bas: SOL - 13_000 });
  const c = pose(carte);
  jouer(c, carte, SAUT, 3); // 1900 + 1800 + 1700 > 5000 unités d'espace libre
  assert.equal(boiteDe(c).haut, SOL - 13_000);
  assert.equal(c.vy, 0);
  while (!c.auSol) jouer(c, carte, 0);
  assert.equal(c.y, SOL);
});

test("marcher au-delà d'un bord fait tomber, sans perdre le double saut", () => {
  const corniche: Carte = { ...PLAINE, solides: [{ gauche: -LOIN, haut: SOL, droite: 10_000, bas: LOIN }] };
  const c = pose(corniche);
  for (let t = 0; c.auSol; t++) {
    assert.ok(t < 200, "le combattant ne quitte jamais le bord");
    jouer(c, corniche, DROITE);
  }
  jouer(c, corniche, DROITE, 5);
  assert.ok(c.y > SOL);
  assert.equal(c.sautsRestants, 1);
});

/** Entrées pseudo-aléatoires tenues quelques ticks, comme un vrai joueur. */
function entreesAleatoires(graine: number, n: number): Entree[] {
  let x = graine;
  const suivant = () => (x = (Math.imul(x, 1103515245) + 12345) >>> 0);
  const entrees: Entree[] = [];
  while (entrees.length < n) {
    const e = suivant() & (GAUCHE | DROITE | SAUT | DASH);
    for (let k = 1 + (suivant() % 12); k > 0; k--) entrees.push(e);
  }
  return entrees.slice(0, n);
}

/** Joue les entrées dans l'arène du prototype en vérifiant les invariants à chaque tick. */
function simuler(entrees: Entree[]): number[] {
  const monde = creerMondeBacASable();
  const [c] = monde.combattants;
  const l = ARENE_BAC_A_SABLE.limites;
  const empreintes: number[] = [];
  for (const e of entrees) {
    avancerMonde(monde, [e]);
    for (const v of [c.x, c.y, c.vx, c.vy, c.sautsRestants, c.dashsRestants, c.dash, c.recharge]) {
      assert.ok(Number.isSafeInteger(v), `valeur non entière au tick ${monde.tick}`);
    }
    const b = boiteDe(c);
    for (const s of ARENE_BAC_A_SABLE.solides) assert.ok(!chevauche(b, s), `dans un solide au tick ${monde.tick}`);
    assert.ok(b.gauche >= l.gauche && b.droite <= l.droite && b.haut >= l.haut && b.bas <= l.bas);
    if (monde.tick % 500 === 0) empreintes.push(empreinteMonde(monde));
  }
  return empreintes;
}

test("mêmes entrées, même monde : la simulation est déterministe et reste cohérente", () => {
  const entrees = entreesAleatoires(42, 20_000);
  const a = simuler(entrees);
  assert.deepEqual(simuler(entrees), a);
  assert.notEqual(simuler(entreesAleatoires(7, 20_000)).at(-1), a.at(-1));
});

test("le mannequin apparaît posé sur le sol du bac à sable", () => {
  const monde = creerMondeBacASable();
  avancerMonde(monde, []);
  const [c] = monde.combattants;
  assert.equal(c.auSol, true);
  assert.equal(c.y, ARENE_BAC_A_SABLE.apparitions[0].y);
});
