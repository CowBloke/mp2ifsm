import { test } from "node:test";
import assert from "node:assert/strict";
import { STATUTS, lirePeriode, passages, prochainStatut, statutPour } from "../src/lib/toilet-statuts";
import { ilYa } from "../src/lib/toilet";

test("statuts : paliers strictement croissants, premier à zéro", () => {
  assert.equal(STATUTS[0].seuil, 0);
  for (let i = 1; i < STATUTS.length; i++) assert.ok(STATUTS[i].seuil > STATUTS[i - 1].seuil);
  assert.equal(new Set(STATUTS.map(s => s.titre)).size, STATUTS.length);
});

test("statutPour et prochainStatut", () => {
  assert.equal(statutPour(0).titre, "Vessie de pierre");
  assert.equal(statutPour(1).titre, "Premier jet");
  assert.equal(statutPour(2).titre, "Premier jet");
  assert.equal(statutPour(100).titre, "Sa Majesté du petit coin");
  assert.equal(statutPour(10_000).seuil, 500);
  assert.deepEqual([prochainStatut(0)?.seuil, prochainStatut(0)?.restant], [1, 1]);
  assert.deepEqual([prochainStatut(7)?.seuil, prochainStatut(7)?.restant], [10, 3]);
  assert.equal(prochainStatut(500), null);
});

test("lirePeriode retombe sur la semaine", () => {
  assert.equal(lirePeriode("mois"), "mois");
  assert.equal(lirePeriode("total"), "total");
  assert.equal(lirePeriode("'; drop table"), "semaine");
  assert.equal(lirePeriode(undefined), "semaine");
});

test("passages : accord", () => {
  assert.equal(passages(0), "aucun passage");
  assert.equal(passages(1), "1 passage");
  assert.equal(passages(3), "3 passages");
});

test("ilYa : relatif puis heure de Paris", () => {
  const m = new Date("2026-11-09T15:00:00Z"); // 16:00 à Paris
  assert.equal(ilYa(new Date(m.getTime() - 20_000), m), "à l’instant");
  assert.equal(ilYa(new Date(m.getTime() - 12 * 60_000), m), "il y a 12 min");
  assert.equal(ilYa(new Date(m.getTime() - 3 * 3_600_000), m), "il y a 3 h");
  assert.equal(ilYa("2026-11-09T06:30:00Z", m), "aujourd’hui 07:30");
  assert.equal(ilYa("2026-11-08T13:05:00Z", m), "hier 14:05");
  assert.equal(ilYa("2026-11-02T07:30:00Z", m), "02/11 08:30");
});
