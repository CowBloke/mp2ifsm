/** Shared scanner: TeX braces must never be mistaken for Anki's closing }}. */
export function estEchappe(source: string, position: number): boolean {
  let n = 0;
  while (position > 0 && source[--position] === "\\") n++;
  return n % 2 === 1;
}

export type Trou = { debut: number; fin: number; numero: number; reponse: string; indice: string };
export function lireTrou(source: string, debut: number): Trou | null {
  if (!source.startsWith("{{", debut)) return null;
  const ouverture = /^\{\{\s*c(\d+)\s*::/i.exec(source.slice(debut));
  if (!ouverture) return null;
  const contenu = debut + ouverture[0].length;
  let profondeur = 0, separation = -1;
  for (let i = contenu; i < source.length; i++) {
    if (estEchappe(source, i)) continue;
    if (profondeur === 0 && source.startsWith("}}", i)) {
      return { debut, fin: i + 2, numero: Number(ouverture[1]),
        reponse: source.slice(contenu, separation < 0 ? i : separation),
        indice: separation < 0 ? "" : source.slice(separation + 2, i).trim() };
    }
    if (profondeur === 0 && separation < 0 && source.startsWith("::", i)) separation = i;
    if (source[i] === "{") profondeur++;
    if (source[i] === "}" && profondeur > 0) profondeur--;
  }
  return null;
}

export function trouverTrous(source: string): Trou[] {
  const trous: Trou[] = [];
  for (let i = 0; i < source.length; i++) {
    const trou = source.startsWith("{{", i) ? lireTrou(source, i) : null;
    if (trou) { trous.push(trou); i = trou.fin - 1; }
  }
  return trous;
}

export type Formule = { debut: number; fin: number; valeur: string; bloc: boolean };
export function lireFormule(source: string, debut: number): Formule | null {
  if (estEchappe(source, debut)) return null;
  const delimiteur = source.startsWith("$$", debut) ? "$$" : source[debut] === "$" ? "$"
    : source.startsWith("\\(", debut) ? "\\(" : source.startsWith("\\[", debut) ? "\\[" : null;
  if (!delimiteur) return null;
  const fermeture = delimiteur === "\\(" ? "\\)" : delimiteur === "\\[" ? "\\]" : delimiteur;
  for (let i = debut + delimiteur.length; i < source.length; i++) {
    const trou = source.startsWith("{{", i) ? lireTrou(source, i) : null;
    if (trou) { i = trou.fin - 1; continue; }
    if (source.startsWith(fermeture, i) && !estEchappe(source, i)) {
      return { debut, fin: i + fermeture.length, valeur: source.slice(debut + delimiteur.length, i),
        bloc: delimiteur === "$$" || delimiteur === "\\[" };
    }
  }
  return null;
}
