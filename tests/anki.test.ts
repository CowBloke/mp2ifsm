import { champsConstants, ecrireApkg, lireApkg, htmlVersTexte, formaterCloze } from "../src/lib/anki";

let echecs = 0;
const verifier = (nom: string, condition: boolean, detail = "") => {
  console.log(`${condition ? "PASS" : "FAIL"}  ${nom}${condition ? "" : "  <- " + detail}`);
  if (!condition) echecs++;
};

// --- champs constants (étiquette de chapitre) -------------------------
{
  const notes = Array.from({ length: 6 }, (_, i) => [`Q${i}`, `R${i}`, "Chapitre 3"]);
  const c = champsConstants(notes);
  verifier("un champ identique sur toutes les notes est ignoré", c.has(2) && !c.has(1), [...c].join());
  verifier("le premier champ n'est jamais ignoré", !champsConstants(notes.map((n) => ["X", ...n.slice(1)])).has(0));
  verifier("trop peu de notes : rien n'est ignoré", champsConstants(notes.slice(0, 3)).size === 0);
}

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

// --- formatage cloze ------------------------------------------------
const c1 = formaterCloze("Capitale : {{c1::Paris}}");
verifier("cloze simple recto", c1[0]?.recto === "Capitale : {{c1::Paris}}");
verifier("cloze simple verso", c1[0]?.verso === "(vide)");

const c2 = formaterCloze("Capitale : {{c1::Paris::ville lumière}}");
verifier("cloze avec indice recto", c2[0]?.recto === "Capitale : {{c1::Paris::ville lumière}}");
verifier("cloze avec indice verso", c2[0]?.verso === "(vide)");

const c3 = formaterCloze("{{c1::Rome}} est en {{c2::Italie}}");
verifier("cloze multiple engendre deux fiches", c3.length === 2);
verifier("cloze multiple c1 recto", c3[0]?.recto === "{{c1::Rome}} est en Italie");
verifier("cloze multiple c1 verso", c3[0]?.verso === "(vide)");
verifier("cloze multiple c2 recto", c3[1]?.recto === "Rome est en {{c2::Italie}}");
verifier("cloze multiple c2 verso", c3[1]?.verso === "(vide)");

const c4 = formaterCloze("Solutions : {{c1::1}} et {{c1::-1}}");
verifier("cloze doublon recto", c4[0]?.recto === "Solutions : {{c1::1}} et {{c1::-1}}");
verifier("cloze doublon verso", c4[0]?.verso === "(vide)");

const c5 = formaterCloze("{{c1::H2O}}", "Formule de l'eau");
verifier("cloze avec champ extra", c5[0]?.verso === "Formule de l'eau");

const c6 = formaterCloze("Dérivée : {{c1::$\\cos(x)$::fonction}}", "Trigonométrie");
verifier("cloze avec formule mathématique", c6[0]?.recto === "Dérivée : {{c1::$\\cos(x)$::fonction}}" && c6[0]?.verso === "Trigonométrie");

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

// --- import archive cloze -------------------------------------------
const archiveCloze = await ecrireApkg("Paquet Cloze", [
  { recto: "La capitale de l'Australie est {{c1::Canberra}}.", verso: "Océanie" },
]);
const reluCloze = await lireApkg(archiveCloze);
verifier("archive cloze recto", reluCloze.notes[0]?.recto === "La capitale de l'Australie est {{c1::Canberra}}.");
verifier("archive cloze verso", reluCloze.notes[0]?.verso === "Océanie");
verifier("archive cloze guid suffixe", reluCloze.notes[0]?.guid.endsWith("-c1") === true);

console.log(`\n${echecs === 0 ? "TOUS LES TESTS PASSENT" : echecs + " ÉCHEC(S)"}`);
process.exit(echecs === 0 ? 0 : 1);
