import "server-only";
import katex from "katex";

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
  // Les trous d'abord : leur réponse peut contenir des formules.
  // $$…$$ testé avant $…$, sinon le second avalerait le premier.
  const motif = /\{\{c\d+::([\s\S]+?)\}\}|\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|!\[([^\]]*)\]\(([^)\s]+)\)/g;

  let position = 0;
  for (const m of source.matchAll(motif)) {
    if (m.index > position) {
      morceaux.push({ type: "texte", valeur: source.slice(position, m.index) });
    }
    if (m[1] !== undefined) {
      const sep = m[1].indexOf("::");
      morceaux.push(sep === -1
        ? { type: "trou", reponse: m[1], indice: "" }
        : { type: "trou", reponse: m[1].slice(0, sep), indice: m[1].slice(sep + 2).trim() });
    }
    else if (m[2] !== undefined) morceaux.push({ type: "maths", valeur: m[2], bloc: true });
    else if (m[3] !== undefined) morceaux.push({ type: "maths", valeur: m[3], bloc: false });
    else                         morceaux.push({ type: "image", alt: m[4] ?? "", url: m[5] });
    position = m.index + m[0].length;
  }
  if (position < source.length) {
    morceaux.push({ type: "texte", valeur: source.slice(position) });
  }
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
  return decouper(source).map((m) => {
    if (m.type === "trou") {
      if (face === "question") {
        return `<span class="trou">[${m.indice ? echapper(m.indice) : "…"}]</span>`;
      }
      return `<span class="trou trou-revele">${rendreContenu(m.reponse, face)}</span>`;
    }

    if (m.type === "maths") {
      try {
        const html = katex.renderToString(m.valeur, {
          displayMode: m.bloc,
          throwOnError: false,   // une formule fautive s'affiche en rouge
          strict: false,
          output: "html",
          trust: false,          // \href et \includegraphics restent interdits
        });
        return m.bloc ? `<div class="bloc-maths">${html}</div>` : html;
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

export type CarteComposee = { rectoHtml: string; rectoReveleHtml: string; versoHtml: string };

/**
 * Les trois vues d'une carte en session : le recto posé en question,
 * le recto une fois révélé (trous remplis), et le verso — omis quand il
 * n'est qu'un remplissage, cas des textes à trous importés.
 */
export function composerCarte(recto: string, verso: string): CarteComposee {
  return {
    rectoHtml: rendreContenu(recto, "question"),
    rectoReveleHtml: rendreContenu(recto, "reponse"),
    versoHtml: verso.trim() === VERSO_VIDE ? "" : rendreContenu(verso, "reponse"),
  };
}
