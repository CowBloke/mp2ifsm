import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PERIODES, GROUPE_MAX, collesDuGroupe, dateParis, groupeValide, lundiDe,
  periodeCourante, semaineDuGroupe,
} from "../src/lib/colloscope";

test("every period is internally consistent", () => {
  for (const p of PERIODES) {
    const codes = new Set(p.creneaux.map((c) => c.code));
    assert.equal(codes.size, p.creneaux.length, `${p.id}: duplicate slot code`);
    for (const [rotation, liste] of Object.entries(p.rotations)) {
      for (const code of liste) assert.ok(codes.has(code), `${p.id}: ${rotation} → unknown ${code}`);
    }
    for (let g = 1; g <= p.groupes; g++) {
      assert.equal(p.planning[g]?.length, p.semaines.length, `${p.id}: group ${g} row length`);
      for (const r of p.planning[g]) assert.ok(p.rotations[r], `${p.id}: unknown rotation ${r}`);
    }
    for (const c of p.creneaux) {
      assert.match(c.code, /^[APMF]\d+$/);
      assert.equal(c.code[0], c.matiere, `${c.code}: subject letter must match the code`);
      assert.ok(c.horaire.debut < c.horaire.fin, `${c.code}: start before end`);
    }
  }
});

test("S1 planning follows the printed cyclic rotation", () => {
  const s1 = PERIODES.find((p) => p.id === "2026-2027-S1")!;
  for (let g = 1; g <= 16; g++) {
    for (let w = 0; w < 14; w++) {
      assert.equal(s1.planning[g][w], `C${((g - 1 + w) % 16) + 1}`);
    }
  }
  assert.deepEqual(s1.rotations.C8, ["P4"], "M8 is a rest week");
  assert.equal(GROUPE_MAX, 16);
  assert.ok(groupeValide(16) && !groupeValide(0) && !groupeValide(17) && !groupeValide(2.5));
});

test("Paris wall times convert across daylight saving changes", () => {
  assert.equal(dateParis("2026-09-23", "15:00").toISOString(), "2026-09-23T13:00:00.000Z");
  assert.equal(dateParis("2026-11-04", "13:00").toISOString(), "2026-11-04T12:00:00.000Z");
  assert.equal(lundiDe("2026-12-01"), "2026-11-30");
  assert.equal(lundiDe("2026-09-21"), "2026-09-21");
  assert.equal(lundiDe("2026-09-27"), "2026-09-21");
});

test("group 10 week 1 (C10) is P5 Toulemonde and M10 Révol", () => {
  const s = semaineDuGroupe(10, "2026-09-21");
  assert.equal(s.numero, 1);
  assert.equal(s.rotation, "C10");
  assert.deepEqual(s.colles.map((c) => [c.creneau, c.colleur, c.salle]), [
    ["M10", "Mme Révol", "F 01"],
    ["P5", "M. Toulemonde", "N 17"],
  ]);
  // Jeudi 24 septembre 17 h à Paris.
  assert.equal(s.colles[0].debut.toISOString(), "2026-09-24T15:00:00.000Z");
});

test("P2 keeps its Friday fallback and note; rest weeks carry their note", () => {
  const s = semaineDuGroupe(4, "2026-09-21"); // C4 : P2 + F4
  assert.deepEqual(s.colles.map((c) => c.creneau), ["P2", "F4"]);
  const p2 = s.colles[0];
  assert.equal(p2.alternative?.salle, "RF 31");
  assert.equal(p2.alternative?.debut.toISOString(), "2026-09-25T16:00:00.000Z");
  assert.ok(p2.notes[0].includes("informatique"));
  assert.ok(s.notes.some((n) => n.includes("français")));
  // F4 dure 1 h 30.
  assert.equal(s.colles[1].fin.getTime() - s.colles[1].debut.getTime(), 90 * 60_000);
});

test("weeks without colles and unknown groups return nothing", () => {
  assert.equal(semaineDuGroupe(1, "2026-10-19").periode, null, "Toussaint");
  assert.deepEqual(semaineDuGroupe(0, "2026-09-21").colles, []);
  assert.deepEqual(collesDuGroupe(99, new Date("2026-09-01"), new Date("2027-02-01")), []);
  const all = collesDuGroupe(1, new Date("2026-09-01"), new Date("2027-02-01"));
  assert.equal(all.length, 14 * 2 - 1, "two colles per week except C8 (group 1 never reaches C16)");
  assert.ok(all.every((c, i) => i === 0 || all[i - 1].debut <= c.debut));
  assert.equal(periodeCourante("2026-10-20")?.id, "2026-2027-S1");
});
