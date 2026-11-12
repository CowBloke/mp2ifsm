/*
 * HTML déjà composé par rendreContenu (serveur) : formules KaTeX, le reste
 * échappé. Sans import serveur, utilisable dans un composant client.
 */
export function ContenuRenduClient({ html, className = "" }: { html: string; className?: string }) {
  return <div className={`contenu-carte ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
