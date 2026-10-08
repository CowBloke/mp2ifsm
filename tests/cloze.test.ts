import { test } from "node:test";
import assert from "node:assert/strict";
import { restaurerClozeImporte } from "../src/lib/cloze";
import { composerCarte } from "../src/lib/rendu";

test("existing imported clozes reveal inline, keeping extras", () => {
  const c = restaurerClozeImporte("[...] est en [pays]", "Rome, Italie\n\nEurope", "note-c1");
  const rendu = composerCarte(c.recto, c.verso);
  assert.ok(!rendu.rectoHtml.includes("Rome") && !rendu.rectoHtml.includes("Italie"));
  assert.ok(rendu.rectoReveleHtml.includes("Italie"));
  assert.equal(c.verso, "Europe");
});
test("single legacy answer can contain commas", () => {
  assert.equal(restaurerClozeImporte("[...]", "a, b", "note-c1").recto, "{{c1::a, b}}");
});
test("basic, current and ambiguous cards stay intact", () => {
  for (const [recto, verso, guid] of [
    ["[...]", "Answer", null],
    ["{{c1::Rome}}", "Extra", "note-c1"],
    ["[...] [...]", "a, b, c", "note-c1"],
  ]) assert.deepEqual(restaurerClozeImporte(recto!, verso!, guid), { recto, verso });
});
