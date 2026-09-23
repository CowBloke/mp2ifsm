/*
 * Noms affichés : deux combattants ne portent jamais le même (trois
 * « Bot moyen » deviennent « Bot moyen », « Bot moyen 2 », « Bot moyen 3 »).
 */

export function nomsDistincts(noms: readonly string[]): string[] {
  const vus = new Map<string, number>();
  const pris = new Set(noms);
  return noms.map((nom) => {
    const n = (vus.get(nom) ?? 0) + 1;
    vus.set(nom, n);
    if (n === 1) return nom;
    let k = n;
    while (pris.has(`${nom} ${k}`)) k++;
    pris.add(`${nom} ${k}`);
    return `${nom} ${k}`;
  });
}
