import { composerCarte, rendreContenu } from "../src/lib/rendu";

let echecs = 0;
const verifier = (nom: string, condition: boolean, detail = "") => {
  console.log(`${condition ? "PASS" : "FAIL"}  ${nom}${condition ? "" : "  <- " + detail}`);
  if (!condition) echecs++;
};

// --- textes à trous -------------------------------------------------
const q = rendreContenu("Capitale : {{c1::Paris}}", "question");
verifier("trou masqué sur la question", q.includes("[…]") && !q.includes("Paris"), q);

const r = rendreContenu("Capitale : {{c1::Paris}}", "reponse");
verifier("trou rempli sur la réponse", r.includes("trou-revele") && r.includes("Paris") && !r.includes("{{"), r);

const indice = rendreContenu("{{c2::Paris::ville lumière}}", "question");
verifier("indice affiché", indice.includes("[ville lumière]") && !indice.includes("Paris"), indice);

const maths = rendreContenu("{{c1::$x^2$}}", "reponse");
verifier("formule dans un trou composée", maths.includes("katex") && !maths.includes("$"), maths);

const echappe = rendreContenu("{{c1::let <id> = <expr>}}", "reponse");
verifier("réponse échappée", echappe.includes("&lt;id&gt;") && !echappe.includes("<id>"), echappe);

// --- composition d'une carte de session -----------------------------
const importee = composerCarte("• {{c1::Typage fort}} : {{c2::toute expression}}", "(vide)");
verifier("verso de remplissage omis", importee.versoHtml === "", importee.versoHtml);
verifier("question sans réponse", !importee.rectoHtml.includes("Typage fort"), importee.rectoHtml);
verifier("recto révélé avec réponses", importee.rectoReveleHtml.includes("Typage fort"), importee.rectoReveleHtml);

const basique = composerCarte("Question ?", "Réponse");
verifier("carte basique inchangée",
  basique.rectoHtml === basique.rectoReveleHtml && basique.versoHtml.includes("Réponse"));

console.log(`\n${echecs === 0 ? "TOUS LES TESTS PASSENT" : echecs + " ÉCHEC(S)"}`);
process.exit(echecs === 0 ? 0 : 1);
