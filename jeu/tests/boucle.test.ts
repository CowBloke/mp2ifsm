import { test } from "node:test";
import assert from "node:assert/strict";
import { cadrerGroupe, lisser, suivreCible } from "../client/camera";
import { RATTRAPAGE_MAX, creerHorloge, fractionTick, ticksAJouer } from "../noyau/horloge";

test("l'horloge convertit le temps réel en ticks entiers, à 60 par seconde", () => {
  const h = creerHorloge();
  let ticks = 0;
  for (let i = 0; i < 100; i++) ticks += ticksAJouer(h, 10);
  assert.equal(ticks, 60);
  assert.equal(fractionTick(h), 0);

  const h144 = creerHorloge();
  let ticks144 = 0;
  for (let i = 0; i < 1440; i++) ticks144 += ticksAJouer(h144, 1000 / 144);
  assert.ok(Math.abs(ticks144 - 600) <= 1, `${ticks144} ticks en 10 s à 144 Hz`);
  assert.ok(fractionTick(h144) >= 0 && fractionTick(h144) < 1);
});

test("un long gel de l'onglet n'est pas rattrapé d'un coup", () => {
  const h = creerHorloge();
  assert.equal(ticksAJouer(h, 5000), RATTRAPAGE_MAX);
  assert.equal(ticksAJouer(h, 0), 0);
  assert.equal(ticksAJouer(h, -50), 0, "un temps négatif est ignoré");
});

test("la caméra suit la cible sans jamais montrer l'extérieur de l'arène", () => {
  const limites = { gauche: 0, haut: 0, droite: 3200, bas: 1400 };
  const cam = { x: 1600, y: 700 };

  suivreCible(cam, 2000, 700, Infinity, 1600, 900, limites);
  assert.deepEqual(cam, { x: 2000, y: 700 });

  suivreCible(cam, 3150, 1350, Infinity, 1600, 900, limites);
  assert.deepEqual(cam, { x: 2400, y: 950 }, "bornée aux bords");

  const lisse = { x: 1000, y: 700 };
  suivreCible(lisse, 1500, 700, 16, 1600, 900, limites);
  assert.ok(lisse.x > 1000 && lisse.x < 1500, "lissage progressif");

  suivreCible(cam, 0, 0, Infinity, 5000, 900, limites);
  assert.equal(cam.x, 1600, "arène plus étroite que la vue : centrée");
});

test("cadrage spectateur : tous les combattants dans le plan, ni trop serré ni plus large que l'arène", () => {
  const limites = { gauche: 0, haut: 0, droite: 3200, bas: 1400 };
  const marges = { margeX: 300, margeY: 250, hauteurMin: 700 };
  const ratio = 16 / 9;

  const proches = cadrerGroupe([{ x: 1500, y: 900 }, { x: 1600, y: 900 }], ratio, limites, marges);
  assert.deepEqual(proches, { x: 1550, y: 900, hauteurVue: 700 }, "deux voisins : plan serré au minimum");

  const eloignes = cadrerGroupe([{ x: 500, y: 900 }, { x: 2500, y: 700 }], ratio, limites, marges);
  assert.equal(eloignes.x, 1500);
  assert.equal(eloignes.hauteurVue, (2000 + 600) / ratio, "la largeur commande : 2000 px d'écart et les marges");
  for (const x of [500, 2500]) assert.ok(Math.abs(x - eloignes.x) + 300 <= (eloignes.hauteurVue * ratio) / 2 + 1e-9);

  const extremes = cadrerGroupe([{ x: -900, y: 0 }, { x: 4000, y: 1400 }], ratio, limites, marges);
  assert.equal(extremes.hauteurVue, 1800, "jamais plus large que l'arène entière (3200 de large en 16/9)");

  assert.deepEqual(cadrerGroupe([], ratio, limites, marges), { x: 1600, y: 700, hauteurVue: 1800 }, "personne : toute l'arène");
  assert.equal(lisser(0, 100, Infinity, 250), 100);
  const v = lisser(0, 100, 16, 250);
  assert.ok(v > 0 && v < 100);
});
