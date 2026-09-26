import { test } from "node:test";
import assert from "node:assert/strict";
import type { Carte } from "../noyau/carte";
import { boiteDe } from "../noyau/combattant";
import { BAS, DASH, DROITE, GAUCHE, SAUT } from "../noyau/entrees";
import { LOIN, SOL, STATS, carte, jouer, monde, perso } from "./outils";

/** Monde à un combattant posé sur le sol de `c` (un tick d'attente pour s'y poser). */
function pose(c: Carte = carte(), stats = {}) {
  const m = monde([perso({}, stats)], { carte: c });
  jouer(m);
  const f = m.combattants[0];
  assert.equal(f.auSol, true);
  return { m, f };
}

function avec(...solides: Carte["solides"]): Carte {
  const c = carte();
  return { ...c, solides: [...c.solides, ...solides] };
}

test("au repos, le combattant reste posé exactement sur le sol", () => {
  const { m, f } = pose();
  jouer(m, 0, 100);
  assert.deepEqual([f.x, f.y, f.vx, f.vy, f.auSol], [0, SOL, 0, 0, true]);
});

test("la gravité fait tomber jusqu'au sol, à vitesse plafonnée, sans jamais l'enfoncer", () => {
  const m = monde([perso()], { carte: carte({ apparitions: [{ x: 0, y: SOL - 500_000 }] }) });
  const f = m.combattants[0];
  for (let t = 0; !f.auSol; t++) {
    assert.ok(t < 1000, "le combattant n'atterrit jamais");
    jouer(m);
    assert.ok(f.vy <= STATS.vitesseChuteMax);
    assert.ok(f.y <= SOL);
  }
  assert.equal(f.y, SOL);
  assert.equal(f.vy, 0);
});

test("se déplacer accélère jusqu'à la vitesse maximale ; relâcher freine jusqu'à l'arrêt", () => {
  const { m, f } = pose();
  jouer(m, DROITE);
  assert.equal(f.vx, 200);
  jouer(m, DROITE, 20);
  assert.equal(f.vx, STATS.vitesseSol);
  assert.equal(f.orientation, 1);

  const x = f.x;
  jouer(m, 0, 4);
  assert.equal(f.vx, 0);
  assert.equal(f.x - x, 600 + 400 + 200);

  jouer(m, GAUCHE);
  assert.equal(f.vx, -200);
  assert.equal(f.orientation, -1);
});

test("un saut monte de 19 000 unités et retombe au même endroit en 39 ticks", () => {
  const { m, f } = pose();
  let plusHaut = f.y;
  let ticks = 0;
  // Touche tenue du début à la fin : un seul saut, aucun double saut.
  do {
    jouer(m, SAUT);
    plusHaut = Math.min(plusHaut, f.y);
    ticks++;
  } while (!f.auSol);
  assert.equal(SOL - plusHaut, 19_000); // Σ (2000 − 100k), k = 1..19
  assert.equal(ticks, 39);
  assert.equal(f.y, SOL);

  jouer(m, SAUT, 10);
  assert.equal(f.auSol, true, "tenir la touche au sol ne relance pas de saut");
});

test("un saut demandé juste avant d'atterrir part dès l'atterrissage", () => {
  const { m, f } = pose(carte(), { sautsAeriens: 0 });
  jouer(m, SAUT);
  jouer(m, 0, 34);
  jouer(m, SAUT); // 4 ticks avant de toucher le sol : gardé en mémoire
  jouer(m, 0, 4);
  assert.equal(f.auSol, false, "le saut est reparti sans nouvel appui");
  assert.ok(f.vy < 0);
});

test("le double saut ne sert qu'une fois en l'air et se recharge au sol", () => {
  const { m, f } = pose();
  jouer(m, SAUT);
  jouer(m, 0, 19);
  assert.equal(f.vy, 0, "apogée du premier saut");

  jouer(m, SAUT);
  assert.equal(f.sautsRestants, 0);
  let plusHaut = f.y;
  while (f.vy < 0) {
    jouer(m);
    plusHaut = Math.min(plusHaut, f.y);
  }
  assert.equal(SOL - plusHaut, 19_000 + 10_500); // + Σ (1500 − 100k), k = 1..14

  const vy = f.vy;
  jouer(m);
  jouer(m, SAUT);
  assert.equal(f.vy, vy + 2 * STATS.gravite, "un troisième saut est refusé");

  while (!f.auSol) jouer(m);
  assert.equal(f.sautsRestants, 1);
});

test("un dash parcourt exactement vitesse × durée, sans gravité, du côté regardé", () => {
  const { m, f } = pose();
  jouer(m, DASH);
  jouer(m, 0, STATS.dashDuree - 1);
  assert.equal(f.x, STATS.dashVitesse * STATS.dashDuree);
  assert.equal(f.y, SOL);
  assert.equal(f.dash, 0);
  assert.equal(f.rechargeDash, STATS.dashRecharge);

  const g = pose();
  g.f.orientation = -1;
  jouer(g.m, DASH, STATS.dashDuree);
  assert.equal(g.f.x, -STATS.dashVitesse * STATS.dashDuree);

  const d = pose();
  jouer(d.m, DASH | GAUCHE, STATS.dashDuree);
  assert.equal(d.f.x, -STATS.dashVitesse * STATS.dashDuree, "la direction tenue l'emporte");

  const a = pose();
  jouer(a.m, SAUT);
  jouer(a.m, 0, 19);
  const y = a.f.y;
  jouer(a.m, DASH, STATS.dashDuree);
  assert.equal(a.f.y, y, "en l'air, le dash est horizontal");
});

test("la recharge sépare deux dashs ; en l'air, un seul dash avant de retoucher le sol", () => {
  const { m, f } = pose();
  jouer(m, DASH);
  jouer(m, 0, STATS.dashDuree - 1);
  jouer(m, DASH);
  assert.equal(f.dash, 0, "refusé pendant la recharge");
  jouer(m, 0, STATS.dashRecharge - 2);
  assert.equal(f.rechargeDash, 1);
  jouer(m, DASH);
  assert.ok(f.dash > 0, "accepté dès la fin de la recharge");

  const vide = monde([perso()], { carte: carte({ solides: [] }) });
  const v = vide.combattants[0];
  jouer(vide, DASH);
  assert.equal(v.dashsRestants, 0);
  jouer(vide, 0, 40);
  jouer(vide, DASH);
  assert.equal(v.dash, 0, "second dash aérien refusé");

  const haut = monde([perso()], { carte: carte({ apparitions: [{ x: 0, y: SOL - 50_000 }] }) });
  const p = haut.combattants[0];
  jouer(haut, DASH);
  while (!p.auSol) jouer(haut);
  assert.equal(p.dashsRestants, 1, "rendu à l'atterrissage");
});

test("sauter interrompt le dash", () => {
  const { m, f } = pose();
  jouer(m, DASH);
  jouer(m, 0, 2);
  jouer(m, SAUT);
  assert.equal(f.dash, 0);
  assert.equal(f.rechargeDash, STATS.dashRecharge);
  assert.ok(f.vy < 0);
});

test("un mur arrête le combattant exactement contre sa face", () => {
  const c = avec({ gauche: 10_000, haut: 0, droite: 12_000, bas: SOL });
  const { m, f } = pose(c);
  jouer(m, DROITE, 60);
  assert.equal(boiteDe(f).droite, 10_000);
  assert.equal(f.vx, 0);
});

test("aucune vitesse ne permet de traverser un mur, même épais d'une unité", () => {
  const c = avec({ gauche: 50_000, haut: 0, droite: 50_001, bas: SOL });
  const { m, f } = pose(c, { dashVitesse: 1_000_000 });
  jouer(m, DASH);
  assert.equal(boiteDe(f).droite, 50_000);
});

test("un plafond arrête la montée, puis le combattant retombe", () => {
  const c = avec({ gauche: -100_000, haut: SOL - 20_000, droite: 100_000, bas: SOL - 13_000 });
  const { m, f } = pose(c);
  jouer(m, SAUT, 3); // 1900 + 1800 + 1700 > 5000 unités d'espace libre
  assert.equal(boiteDe(f).haut, SOL - 13_000);
  assert.equal(f.vy, 0);
  while (!f.auSol) jouer(m);
  assert.equal(f.y, SOL);
});

test("marcher au-delà d'un bord fait tomber, sans perdre le double saut", () => {
  const c = carte({ solides: [{ gauche: -LOIN, haut: SOL, droite: 10_000, bas: LOIN }] });
  const { m, f } = pose(c);
  for (let t = 0; f.auSol; t++) {
    assert.ok(t < 200, "le combattant ne quitte jamais le bord");
    jouer(m, DROITE);
  }
  jouer(m, DROITE, 5);
  assert.ok(f.y > SOL);
  assert.equal(f.sautsRestants, 1);
});

const PLATEFORME = carte({
  plateformes: [{ gauche: -20_000, droite: 20_000, y: SOL - 15_000 }],
});

test("une plateforme se traverse en montant et porte en descendant", () => {
  const { m, f } = pose(PLATEFORME);
  jouer(m, SAUT);
  let traverse = false;
  while (f.vy < 0) {
    jouer(m);
    if (f.y < SOL - 15_000) traverse = true;
  }
  assert.ok(traverse, "le saut passe au-dessus de la plateforme par le dessous");
  while (!f.auSol) jouer(m);
  assert.equal(f.y, SOL - 15_000, "posé sur la plateforme");
});

test("bas sur une plateforme la fait traverser ; bas sur le sol plein ne fait rien", () => {
  const m = monde([perso()], { carte: carte({ ...PLATEFORME, apparitions: [{ x: 0, y: SOL - 15_000 }] }) });
  const f = m.combattants[0];
  jouer(m);
  assert.equal(f.auSol, true);
  jouer(m, BAS);
  jouer(m, 0, 60);
  assert.equal(f.y, SOL, "descendu jusqu'au sol");
  jouer(m, 0);
  jouer(m, BAS, 5);
  assert.equal(f.y, SOL);
});

test("bas pendant la descente déclenche la chute rapide", () => {
  const m = monde([perso()], { carte: carte({ apparitions: [{ x: 0, y: SOL - 200_000 }] }) });
  const f = m.combattants[0];
  jouer(m, 0, 5);
  jouer(m, BAS);
  assert.equal(f.vy, STATS.vitesseChuteRapide);
  jouer(m, BAS, 3);
  assert.equal(f.vy, STATS.vitesseChuteRapide, "la chute rapide est conservée");
});
