import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NOMS_COULEURS, PALETTE, TAILLE, decoderToile, encoderToile, formatAttente, normaliserZone, pixelValide,
} from "../src/lib/place/commun";

test("palette : couleurs uniques, nommées, fond blanc, tient dans le schéma (0..31)", () => {
  assert.equal(PALETTE[0], "#ffffff");
  assert.equal(new Set(PALETTE).size, PALETTE.length);
  assert.equal(NOMS_COULEURS.length, PALETTE.length);
  assert.ok(PALETTE.length <= 32);
  assert.equal(TAILLE, 100); // borne x, y du schéma
});

test("pixelValide refuse ce qui sort de la toile ou de la palette", () => {
  assert.ok(pixelValide(0, 0, 0));
  assert.ok(pixelValide(TAILLE - 1, TAILLE - 1, PALETTE.length - 1));
  for (const [x, y, c] of [[-1, 0, 0], [0, TAILLE, 0], [0, 0, PALETTE.length], [1.5, 0, 0], ["1", 0, 0], [0, 0, null]]) {
    assert.equal(pixelValide(x, y, c), false, `${x},${y},${c}`);
  }
});

test("normaliserZone ordonne les coins et refuse les hors-toile", () => {
  assert.deepEqual(normaliserZone({ x0: 9, y0: 2, x1: 3, y1: 7 }), { x0: 3, y0: 2, x1: 9, y1: 7 });
  assert.deepEqual(normaliserZone({ x0: 4, y0: 4, x1: 4, y1: 4 }), { x0: 4, y0: 4, x1: 4, y1: 4 });
  assert.equal(normaliserZone({ x0: 0, y0: 0, x1: TAILLE, y1: 1 }), null);
  assert.equal(normaliserZone({ x0: 0, y0: 0, x1: 1 }), null);
  assert.equal(normaliserZone(null), null);
});

test("encodage de la toile : aller-retour exact", () => {
  const t = new Uint8Array(TAILLE * TAILLE);
  for (let i = 0; i < t.length; i++) t[i] = (i * 7) % PALETTE.length;
  assert.deepEqual(decoderToile(encoderToile(t)), t);
});

test("formatAttente", () => {
  assert.equal(formatAttente(300_000), "5:00");
  assert.equal(formatAttente(64_001), "1:05");
  assert.equal(formatAttente(-5), "0:00");
});
