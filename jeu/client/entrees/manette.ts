import {
  ATTAQUE, BAS, DASH, DROITE, GAUCHE, HAUT, SAUT, SPECIAL, ULTIME, type Entree,
} from "../../noyau/entrees";

/*
 * Manettes (API Gamepad, disposition « standard ») : stick gauche ou
 * croix pour les directions, A saut, X attaque, B spécial, Y ultime,
 * gâchettes et boutons de tranche pour le dash.
 */

const ZONE_MORTE = 0.45;

export function lireManettes(nav: Navigator): Entree {
  const manettes = nav.getGamepads?.() ?? [];
  let e: Entree = 0;
  for (const m of manettes) {
    if (!m || !m.connected) continue;
    const bouton = (i: number) => m.buttons[i]?.pressed === true;
    const [ax = 0, ay = 0] = m.axes;
    if (ax < -ZONE_MORTE || bouton(14)) e |= GAUCHE;
    if (ax > ZONE_MORTE || bouton(15)) e |= DROITE;
    if (ay < -ZONE_MORTE || bouton(12)) e |= HAUT;
    if (ay > ZONE_MORTE || bouton(13)) e |= BAS;
    if (bouton(0)) e |= SAUT;
    if (bouton(2)) e |= ATTAQUE;
    if (bouton(1)) e |= SPECIAL;
    if (bouton(3)) e |= ULTIME;
    if (bouton(4) || bouton(5) || bouton(6) || bouton(7)) e |= DASH;
  }
  return e;
}
