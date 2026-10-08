import "server-only";
import katex from "katex";
import { lireTrou, lireFormule, trouverTrous } from "./syntaxe-carte";

/*
 * Rendu du contenu d'une carte en HTML, côté serveur.
 *
 * Une seule implémentation sert à la fois l'affichage direct (composant
 * ContenuCarte) et la session de révision, qui reçoit les cartes
 * suivantes déjà composées par une action serveur. KaTeX ne part donc
 * jamais dans le bundle du navigateur.
 *
 * Tout ce qui vient d'un utilisateur est échappé ici ; seules les
 * sorties de KaTeX et nos propres balises <img> sont du HTML.
 *
 * Les textes à trous d'Anki ({{c1::réponse::indice}}) sont masqués sur
 * la face « question » et surlignés sur la face « reponse ».
 */

export type Face = "question" | "reponse";

type Morceau =
  | { type: "texte"; valeur: string }
  | { type: "maths"; valeur: string; bloc: boolean }
  | { type: "image"; url: string; alt: string }
  | { type: "trou"; reponse: string; indice: string };

export function decouper(source: string): Morceau[] {
  const morceaux: Morceau[] = [];
  let position = 0;
  for (let i = 0; i < source.length; i++) {
    const trou = lireTrou(source, i);
    const maths = trou ? null : lireFormule(source, i);
    const image = !trou && !maths ? /^!\[([^\]]*)\]\(([^)\s]+)\)/.exec(source.slice(i)) : null;
    if (!trou && !maths && !image) continue;
    if (i > position) morceaux.push({ type: "texte", valeur: source.slice(position, i) });
    if (trou) { morceaux.push({ type: "trou", reponse: trou.reponse, indice: trou.indice }); position = trou.fin; }
    else if (maths) { morceaux.push({ type: "maths", valeur: maths.valeur, bloc: maths.bloc }); position = maths.fin; }
    else { morceaux.push({ type: "image", alt: image![1], url: image![2] }); position = i + image![0].length; }
    i = position - 1;
  }
  if (position < source.length) morceaux.push({ type: "texte", valeur: source.slice(position) });
  return morceaux;
}

function echapper(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Seules les images servies par nos routes authentifiées sont
 * affichées. Une carte importée depuis Anki ne peut donc pas faire
 * charger une URL externe (fuite d'IP, pixel espion).
 */
function urlImageSure(url: string): string | null {
  return /^\/api\/fiches\/image\/\d+$/.test(url) ? url : null;
}

export function rendreContenu(source: string, face: Face = "reponse"): string {
  let numeroTrou = 0;
  return decouper(source).map((m) => {
    if (m.type === "trou") {
      if (face === "question") {
        return `<span class="trou" data-trou="${numeroTrou++}">[${m.indice ? echapper(m.indice) : "…"}]</span>`;
      }
      return `<span class="trou trou-revele">${rendreContenu(m.reponse, face)}</span>`;
    }

    if (m.type === "maths") {
      try {
        // Clozes inside a formula stay inside TeX, including subscripts and matrices.
        let formule = "", position = 0;
        for (const trou of trouverTrous(m.valeur)) {

          formule += m.valeur.slice(position, trou.debut);
          const reponse = trou.reponse.replace(/^\$\$?([\s\S]*?)\$\$?$/, "$1");
          const indice = trou.indice.replace(/\\text\{([^{}]*)\}/g, "$1")
            .replace(/[\\{}$%&#_^~]/g, " ");
          formule += face === "question" ? `\\text{[${indice || "…"}]}`
            : `\\boxed{${reponse}}`;
          position = trou.fin;
        }
        formule += m.valeur.slice(position);
        const html = katex.renderToString(formule, {
          displayMode: m.bloc,
          macros: { "\\micro": "\\mu" },
          throwOnError: false,   // une formule fautive s'affiche en rouge
          strict: false,
          output: "html",
          trust: false,          // \href et \includegraphics restent interdits
        });
        const rendu = m.bloc ? `<div class="bloc-maths">${html}</div>` : html;
        // A formula is revealed as a unit: replacing only a TeX fragment would
        // break fractions, delimiters and matrix layout already composed by KaTeX.
        return face === "question" && trouverTrous(m.valeur).length
          ? `<${m.bloc ? "div" : "span"} class="trou-formule" data-trou="${numeroTrou++}">${rendu}</${m.bloc ? "div" : "span"}>`
          : rendu;
      } catch {
        return `<code class="maths-erreur">${echapper(m.valeur)}</code>`;
      }
    }

    if (m.type === "image") {
      const url = urlImageSure(m.url);
      if (!url) return `<span class="image-refusee">[image externe ignorée]</span>`;
      return `<img src="${url}" alt="${echapper(m.alt)}" loading="lazy">`;
    }

    return `<span class="texte">${echapper(m.valeur)}</span>`;
  }).join("");
}

/** Texte de remplissage posé par l'import Anki quand un champ est vide. */
const VERSO_VIDE = "(vide)";

export type CarteComposee = {
  rectoHtml: string; rectoReveleHtml: string; versoHtml: string; trousHtml: string[];
};

export function composerCarte(recto: string, verso: string): CarteComposee {
  return {
    rectoHtml: rendreContenu(recto, "question"),
    rectoReveleHtml: rendreContenu(recto, "reponse"),
    versoHtml: verso.trim() === VERSO_VIDE ? "" : rendreContenu(verso, "reponse"),
    trousHtml: decouper(recto).flatMap(m => m.type === "trou"
      ? [rendreContenu(m.reponse, "reponse")]
      : m.type === "maths" && trouverTrous(m.valeur).length
        ? [rendreContenu(`${m.bloc ? "$$" : "$"}${m.valeur}${m.bloc ? "$$" : "$"}`, "reponse")]
        : []),
  };
}
