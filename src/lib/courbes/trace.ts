/*
 * Curve Fight : géométrie du tracé, côté affichage. Module pur.
 *
 * Le serveur envoie un point de courbe par tick. À fort zoom, relier ces
 * points par des segments couperait les virages : quand l'expression est
 * connue, on repasse par la fonction elle-même entre deux ticks.
 */

/** Points intercalés entre deux ticks par `affiner`. */
export const FINESSE = 4;

/**
 * Courbe y = f(x) + decalage redessinée avec FINESSE points par tick.
 * Le point d'indice FINESSE × i est le point i d'origine : l'animation
 * garde son rythme. Là où la fonction n'est pas définie, on retombe sur
 * le segment.
 */
export function affiner(pts: number[], f: (x: number, y: number) => number, decalage: number): number[] {
  const n = pts.length / 2;
  if (n < 2) return pts.slice();
  const fin: number[] = [pts[0], pts[1]];
  for (let i = 1; i < n; i++) {
    const xa = pts[2 * i - 2], ya = pts[2 * i - 1], xb = pts[2 * i], yb = pts[2 * i + 1];
    for (let k = 1; k < FINESSE; k++) {
      const u = k / FINESSE, x = xa + (xb - xa) * u;
      const y = f(x, 0) + decalage;
      // Un point aberrant (saut, pôle entre deux ticks) ne doit pas faire de pic.
      const borne = Math.abs(yb - ya) + 0.5;
      fin.push(x, Number.isFinite(y) && Math.abs(y - (ya + yb) / 2) <= borne ? y : ya + (yb - ya) * u);
    }
    fin.push(xb, yb);
  }
  return fin;
}

/**
 * Graphe de y = f(x) + decalage sur [xa, xb], en morceaux continus :
 * un trou du domaine ou un saut trop haut coupe le trait.
 */
export function echantillonner(
  f: (x: number, y: number) => number, decalage: number,
  xa: number, xb: number, pas: number, sautMax: number,
): number[][] {
  const morceaux: number[][] = [];
  let courant: number[] | null = null;
  let yPrec = NaN;
  const n = Math.min(4000, Math.max(1, Math.ceil((xb - xa) / pas)));
  for (let i = 0; i <= n; i++) {
    const x = xa + ((xb - xa) * i) / n;
    const y = f(x, 0) + decalage;
    if (!Number.isFinite(y) || (courant && Math.abs(y - yPrec) > sautMax)) courant = null;
    if (Number.isFinite(y)) {
      if (!courant) morceaux.push(courant = []);
      courant.push(x, y);
      yPrec = y;
    }
  }
  return morceaux.filter((m) => m.length >= 4);
}

/**
 * Pas des graduations pour une échelle donnée : 1, 2 ou 5 fois une
 * puissance de dix, le plus petit qui laisse `ecartMin` pixels entre
 * deux traits principaux. `divisions` : traits fins par intervalle.
 */
export function graduation(pixelsParUnite: number, ecartMin = 72): { pas: number; divisions: number } {
  const brut = ecartMin / pixelsParUnite;
  const puissance = Math.pow(10, Math.floor(Math.log10(brut)));
  const m = brut / puissance;
  const [mantisse, divisions] = m <= 1 ? [1, 5] : m <= 2 ? [2, 4] : m <= 5 ? [5, 5] : [10, 5];
  return { pas: mantisse * puissance, divisions };
}

/** Nombre d'une graduation ou d'une coordonnée : sans zéros inutiles, avec un vrai signe moins. */
export function ecrireNombre(v: number, decimales = 6): string {
  const n = Number(v.toFixed(decimales));
  return (Object.is(n, -0) ? 0 : n).toString().replace("-", "−");
}
