import { DASH, DROITE, GAUCHE, SAUT, type Entree } from "../noyau/entrees";

/*
 * Clavier → entrée du tick.
 *
 * On lit `event.code`, la position physique de la touche : ZQSD sur un
 * clavier AZERTY et WASD sur un QWERTY tombent au même endroit.
 */

const TOUCHES: Record<string, Entree> = {
  ArrowLeft: GAUCHE, KeyA: GAUCHE,
  ArrowRight: DROITE, KeyD: DROITE,
  ArrowUp: SAUT, KeyW: SAUT, Space: SAUT,
  ShiftLeft: DASH, ShiftRight: DASH,
};

export type Clavier = {
  /** Entrée du prochain tick. */
  entree(): Entree;
  arreter(): void;
};

export function ecouterClavier(cible: Window): Clavier {
  const tenues = new Set<string>();
  // Une touche pressée puis relâchée entre deux ticks compte quand même
  // pour le tick suivant : un appui très bref ne se perd pas.
  let appuis: Entree = 0;

  const bas = (e: KeyboardEvent) => {
    if (!Object.hasOwn(TOUCHES, e.code) || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault(); // Espace et flèches ne font pas défiler la page
    tenues.add(e.code);
    appuis |= TOUCHES[e.code];
  };
  const haut = (e: KeyboardEvent) => {
    tenues.delete(e.code);
  };
  // Fenêtre quittée : on ne reçoit plus les relâchements, rien n'est tenu.
  const vider = () => {
    tenues.clear();
  };

  cible.addEventListener("keydown", bas);
  cible.addEventListener("keyup", haut);
  cible.addEventListener("blur", vider);

  return {
    entree() {
      let e = appuis;
      appuis = 0;
      for (const code of tenues) e |= TOUCHES[code];
      return e;
    },
    arreter() {
      cible.removeEventListener("keydown", bas);
      cible.removeEventListener("keyup", haut);
      cible.removeEventListener("blur", vider);
      vider();
    },
  };
}
