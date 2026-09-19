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
 */

type Morceau =
  | { type: "texte"; valeur: string }
  | { type: "maths"; valeur: string; bloc: boolean }
  | { type: "image"; url: string; alt: string };

export function decouper(source: string): Morceau[] {
  const morceaux: Morceau[] = [];
  // $$…$$ testé avant $…$, sinon le second avalerait le premier.
  const motif = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|!\[([^\]]*)\]\(([^)\s]+)\)/g;

  let position = 0;
  for (const m of source.matchAll(motif)) {
    if (m.index > position) {
      morceaux.push({ type: "texte", valeur: source.slice(position, m.index) });
    }
    if (m[1] !== undefined)      morceaux.push({ type: "maths", valeur: m[1], bloc: true });
    else if (m[2] !== undefined) morceaux.push({ type: "maths", valeur: m[2], bloc: false });
    else                         morceaux.push({ type: "image", alt: m[3] ?? "", url: m[4] });
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

export function rendreContenu(source: string): string {
  return decouper(source).map((m) => {
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
