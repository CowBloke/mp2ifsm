import { test } from "node:test";
import assert from "node:assert/strict";
import { suivreCible } from "../client/camera";
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
