import { ecrireApkg, lireApkg, htmlVersTexte } from "../src/lib/anki";

let echecs = 0;
const verifier = (nom: string, condition: boolean, detail = "") => {
  console.log(`${condition ? "PASS" : "FAIL"}  ${nom}${condition ? "" : "  <- " + detail}`);
  if (!condition) echecs++;
};

// --- conversion HTML -> texte ---------------------------------------
verifier("les <br> deviennent des retours à la ligne",
  htmlVersTexte("a<br>b") === "a\nb", JSON.stringify(htmlVersTexte("a<br>b")));
verifier("\\(x\\) devient $x$",
  htmlVersTexte("\\(x^2\\)") === "$x^2$", htmlVersTexte("\\(x^2\\)"));
verifier("\\[x\\] devient $$x$$",
  htmlVersTexte("\\[\\int_0^1 f\\]") === "$$\\int_0^1 f$$", htmlVersTexte("\\[\\int_0^1 f\\]"));
verifier("[latex] devient $$...$$",
  htmlVersTexte("[latex]e^{i\\pi}[/latex]") === "$$e^{i\\pi}$$");
verifier("les entités sont décodées",
  htmlVersTexte("a &amp; b &lt;c&gt;") === "a & b <c>", htmlVersTexte("a &amp; b &lt;c&gt;"));
verifier("les balises sont retirées",
  htmlVersTexte("<div><b>gras</b></div>") === "gras", htmlVersTexte("<div><b>gras</b></div>"));

// --- aller-retour ----------------------------------------------------
const notes = [
  { recto: "Dérivée de $\\sin x$ ?", verso: "$\\cos x$" },
  { recto: "Énoncé du théorème de Rolle", verso: "Si $f$ est continue sur $[a,b]$…" },
  { recto: "Accents: é à ü ç", verso: "Formule bloc:\n$$\\sum_{n=1}^{\\infty}\\frac1{n^2}=\\frac{\\pi^2}6$$" },
];

const archive = await ecrireApkg("Maths — Analyse — Test", notes);
console.log(`\narchive produite: ${archive.length} octets`);
verifier("l'archive est un ZIP", archive.subarray(0, 2).toString() === "PK");

const relu = await lireApkg(archive);
verifier("le nom du paquet est conservé",
  relu.nom === "Maths — Analyse — Test", String(relu.nom));
verifier("toutes les notes reviennent",
  relu.notes.length === notes.length, `${relu.notes.length} != ${notes.length}`);

for (const [i, attendu] of notes.entries()) {
  const obtenu = relu.notes[i];
  verifier(`note ${i + 1} recto identique`,
    obtenu?.recto === attendu.recto, `${JSON.stringify(obtenu?.recto)}`);
  verifier(`note ${i + 1} verso identique`,
    obtenu?.verso === attendu.verso, `${JSON.stringify(obtenu?.verso)}`);
}

verifier("les guid sont uniques",
  new Set(relu.notes.map((n) => n.guid)).size === relu.notes.length);

console.log(`\n${echecs === 0 ? "TOUS LES TESTS PASSENT" : echecs + " ÉCHEC(S)"}`);
process.exit(echecs === 0 ? 0 : 1);
