import { test } from "node:test";
import assert from "node:assert/strict";
import { directionStick } from "../client/entrees/tactile";
import { BAS, DROITE, GAUCHE, HAUT } from "../noyau/entrees";

/*
 * Stick tactile : zone morte, huit directions, et une horizontale large —
 * un pouce qui marche un peu en biais ne doit ni traverser une plateforme
 * (bas) ni lancer un coup vers le haut.
 */

test("stick tactile : zone morte, puis les huit directions", () => {
  assert.equal(directionStick(5, -6), 0, "petit tremblement : rien");
  assert.equal(directionStick(40, 0), DROITE);
  assert.equal(directionStick(-40, 0), GAUCHE);
  assert.equal(directionStick(0, -40), HAUT);
  assert.equal(directionStick(0, 40), BAS);
  assert.equal(directionStick(40, 40), DROITE | BAS);
  assert.equal(directionStick(-40, -40), GAUCHE | HAUT);
});

test("stick tactile : marcher un peu en biais reste une marche", () => {
  // 30° sous l'horizontale : la droite seule, pas de chute à travers la plateforme.
  const a = (30 * Math.PI) / 180;
  assert.equal(directionStick(50 * Math.cos(a), 50 * Math.sin(a)), DROITE);
  assert.equal(directionStick(-50 * Math.cos(a), -50 * Math.sin(a)), GAUCHE);
  // Presque vertical : la verticale seule.
  const v = (80 * Math.PI) / 180;
  assert.equal(directionStick(50 * Math.cos(v), -50 * Math.sin(v)), HAUT);
});
