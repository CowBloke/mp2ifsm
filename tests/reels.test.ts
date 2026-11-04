import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCompte, formatDecimal, genererReel } from "../src/lib/reels";

function graine(s: number) {
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

test("formatCompte abrège façon réseau social", () => {
  assert.equal(formatCompte(999), "999");
  assert.equal(formatCompte(12_480), "12,4 k");
  assert.equal(formatCompte(1_230_000), "1,2 M");
  assert.equal(formatCompte(345_600), "345 k");
});

test("formatDecimal groupe par trois et met une virgule", () => {
  assert.equal(formatDecimal("−", "1234567", "89"), "−1 234 567,89");
  assert.equal(formatDecimal("", "42", ""), "42");
});

test("chaque réel a un nombre, des commentaires et des likes", () => {
  const r = graine(7);
  const ids = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const reel = genererReel(r, "Alice");
    assert.ok(reel.valeur.length > 0 && !reel.valeur.includes("{n}"));
    assert.ok(reel.likes >= 100);
    assert.ok(reel.commentaires.length >= 1);
    assert.ok(reel.nbCommentaires >= reel.commentaires.length);
    for (const c of reel.commentaires) {
      assert.ok(!c.texte.includes("{n}"));
      assert.notEqual(c.auteur, reel.auteur);
    }
    assert.ok(!ids.has(reel.id)); ids.add(reel.id);
  }
});
