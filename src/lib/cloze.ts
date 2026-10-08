import { lireFormule, trouverTrous, estEchappe } from "./syntaxe-carte";

/** Split legacy answer lists without splitting coordinates, TeX arguments or math. */
export function separerReponses(source: string): string[] {
  const reponses: string[] = [];
  let position = 0, profondeur = 0;
  for (let i = 0; i < source.length; i++) {
    const formule = lireFormule(source, i);
    if (formule) { i = formule.fin - 1; continue; }
    if (estEchappe(source, i)) continue;
    if (/[{(]/.test(source[i])) profondeur++;
    if (/[})]/.test(source[i])) profondeur = Math.max(0, profondeur - 1);
    if (source.startsWith(", ", i) && profondeur === 0) {
      reponses.push(source.slice(position, i)); position = i + 2; i++;
    }
  }
  reponses.push(source.slice(position));
  return reponses;
}

/** Restore flattened imports without treating intervals such as [a,b] as holes.
 * Ambiguous answer lists remain intact until reviewed against the source card.
 */
export function restaurerClozeImporte(recto: string, verso: string, guid: string | null) {
  const original = { recto, verso };
  if (!guid || !/-c\d+$/.test(guid) || trouverTrous(recto).length) return original;
  const formules: Array<{ debut: number; fin: number }> = [];
  for (let i = 0; i < recto.length; i++) {
    const f = lireFormule(recto, i);
    if (f) { formules.push(f); i = f.fin - 1; }
  }
  const trous = [...recto.matchAll(/\[([^\]\n]*)\]/g)].filter(m => {
    if (/^(?:\.\.\.|…)\s*$/.test(m[1])) return true;
    const maths = formules.some(f => m.index >= f.debut && m.index < f.fin);
    return maths ? /^\\text\{/.test(m[1]) : !/[,;]|^[\d\s.+-]+$/.test(m[1]);
  });
  if (!trous.length) return original;
  const separation = verso.indexOf("\n\n");
  const reponse = separation < 0 ? verso : verso.slice(0, separation);
  const reponses = trous.length === 1 ? [reponse] : separerReponses(reponse);
  if (reponses.length !== trous.length || reponses.some(r => !r || /\{\{c|::/.test(r))) return original;
  let resultat = "", position = 0;
  for (const [i, trou] of trous.entries()) {
    resultat += recto.slice(position, trou.index);
    const maths = formules.some(f => trou.index >= f.debut && trou.index < f.fin);
    let valeur = reponses[i];
    if (maths) valeur = valeur.replace(/^\$\$?([\s\S]*?)\$\$?$/, "$1");
    else if (!valeur.includes("$") && /\\[a-zA-Z]|[_^]/.test(valeur)) valeur = `$${valeur}$`;
    const indice = /^(?:\.\.\.|…)\s*$/.test(trou[1]) ? "" : `::${trou[1]}`;
    resultat += `{{c1::${valeur}${indice}}}`;
    position = trou.index + trou[0].length;
  }
  return { recto: resultat + recto.slice(position), verso: separation < 0 ? "(vide)" : verso.slice(separation + 2) };
}
