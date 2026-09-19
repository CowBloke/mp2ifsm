import { rendreContenu } from "@/lib/rendu";

/*
 * Affiche le recto ou le verso d'une carte. Le HTML est produit par
 * `rendreContenu` (serveur) : formules composées par KaTeX, images
 * restreintes à nos routes, et tout le reste échappé.
 */
export function ContenuCarte({
  source, className = "",
}: {
  source: string; className?: string;
}) {
  return (
    <div
      className={`contenu-carte ${className}`}
      dangerouslySetInnerHTML={{ __html: rendreContenu(source) }}
    />
  );
}

/** Variante recevant du HTML déjà rendu (session de révision). */
export function ContenuRendu({
  html, className = "",
}: {
  html: string; className?: string;
}) {
  return (
    <div className={`contenu-carte ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
