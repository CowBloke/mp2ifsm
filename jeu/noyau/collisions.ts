/*
 * Collisions entre boîtes alignées sur les axes, en unités entières.
 *
 * Un déplacement se fait axe par axe. Pour chaque axe, seuls comptent
 * les solides situés DEVANT la boîte dans le sens du mouvement et qui
 * la chevauchent sur l'autre axe : le déplacement est raccourci jusqu'au
 * premier d'entre eux. C'est un balayage exact, donc aucune vitesse, même
 * énorme, ne permet de traverser un mur ou le sol.
 *
 * Les chevauchements sont stricts : une boîte posée sur le sol le touche
 * sans le chevaucher, et peut donc glisser dessus.
 */

export type Boite = {
  gauche: number;
  haut: number;
  droite: number;
  bas: number;
};

/** Déplacement horizontal autorisé (≤ dx en valeur absolue). */
export function deplacementX(b: Boite, dx: number, solides: readonly Boite[]): number {
  let autorise = dx;
  for (const s of solides) {
    if (s.haut >= b.bas || s.bas <= b.haut) continue;
    if (dx > 0 && s.gauche >= b.droite) autorise = Math.min(autorise, s.gauche - b.droite);
    else if (dx < 0 && s.droite <= b.gauche) autorise = Math.max(autorise, s.droite - b.gauche);
  }
  return autorise;
}

/** Déplacement vertical autorisé (≤ dy en valeur absolue). y croît vers le bas. */
export function deplacementY(b: Boite, dy: number, solides: readonly Boite[]): number {
  let autorise = dy;
  for (const s of solides) {
    if (s.gauche >= b.droite || s.droite <= b.gauche) continue;
    if (dy > 0 && s.haut >= b.bas) autorise = Math.min(autorise, s.haut - b.bas);
    else if (dy < 0 && s.bas <= b.haut) autorise = Math.max(autorise, s.bas - b.haut);
  }
  return autorise;
}

/** Vrai si les deux boîtes se chevauchent (le simple contact ne compte pas). */
export function chevauche(a: Boite, b: Boite): boolean {
  return a.gauche < b.droite && b.gauche < a.droite && a.haut < b.bas && b.haut < a.bas;
}
