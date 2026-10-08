import { test } from "node:test";
import assert from "node:assert/strict";
import { composerCarte, rendreContenu } from "../src/lib/rendu";
import { formaterCloze, htmlVersTexte } from "../src/lib/anki";
import { restaurerClozeImporte } from "../src/lib/cloze";

test("balanced TeX braces survive cloze import and rendering", () => {
  const source = String.raw`$S={{c1::\frac{n(n+1)}{2}}}$`;
  assert.equal(formaterCloze(source)[0].recto, source);
  const c = composerCarte(source, "(vide)");
  assert.ok(c.rectoHtml.includes("katex") && c.rectoHtml.includes("…"));
  assert.ok(c.rectoReveleHtml.includes("frac-line"));
  assert.ok(!/katex-error|\{\{c/.test(c.rectoHtml + c.rectoReveleHtml));
});
test("multiline inline math, Anki delimiters and micro alias render", () => {
  for (const s of ["$x\n+y$", String.raw`\(\frac12\)`, String.raw`\[\micro x\]`]) {
    const h = rendreContenu(s);
    assert.ok(h.includes("katex") && !h.includes("katex-error"));
  }
});
test("escaped currency stays text while adjacent formulas render", () => {
  const h = rendreContenu(String.raw`Coût : \$5 ; $x$ et $y$`);
  assert.ok(h.includes("\\$5") && !h.includes("katex-error"));
});
test("legacy intervals and matrix arguments are preserved", () => {
  const c = restaurerClozeImporte(String.raw`$I=|[1,n]|$, $x=[...]$`, String.raw`\frac{b_i}{a_{ii}}`, "note-c1");
  assert.ok(c.recto.includes("[1,n]"));
  assert.ok(c.recto.includes(String.raw`{{c1::\frac{b_i}{a_{ii}}}}`));
  assert.ok(!composerCarte(c.recto, c.verso).rectoReveleHtml.includes("katex-error"));
});
test("legacy lists keep commas inside formulas and coordinates", () => {
  const c = restaurerClozeImporte("[...] puis [...]", String.raw`$(n,m)\in\mathbb{N}^2$, $p\leq n$`, "note-c1");
  assert.equal(c.verso, "(vide)");
  assert.equal((c.recto.match(/\{\{c1::/g) ?? []).length, 2);
});
test("math and image injection stay blocked", () => {
  assert.ok(!rendreContenu(String.raw`$\href{https://example.com}{x}$`).includes('href="https://'));
  assert.ok(!rendreContenu("![](https://example.com/pixel)").includes("<img"));
  assert.ok(rendreContenu("<script>alert(1)</script>").includes("&lt;script&gt;"));
});
test("Anki style, sound markers and hexadecimal entities are cleaned", () => {
  assert.equal(htmlVersTexte('<style>.card{color:red}</style>caf&#xe9;[sound:a.mp3]'), "café");
});
