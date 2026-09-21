import { test } from "node:test";
import assert from "node:assert/strict";
import { deMatiere, heure, plage, salle } from "../src/lib/colles";

test("colle text follows French typography", () => {
  assert.equal(deMatiere("Anglais"), "d’anglais");
  assert.equal(deMatiere("Mathématiques"), "de mathématiques");
  assert.equal(deMatiere("Physique"), "de physique");
  assert.equal(deMatiere("SI"), "de SI");
  assert.equal(heure("2026-09-24T15:00:00Z"), "17 h");
  assert.equal(heure("2026-09-24T15:30:00Z"), "17 h 30");
  assert.equal(plage("2026-09-24T15:00:00Z", "2026-09-24T16:00:00Z"), "17 h – 18 h");
  assert.equal(salle("RF 31"), "RF 31");
});
