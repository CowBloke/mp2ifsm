import {
  ATTAQUE, BAS, DASH, DROITE, GAUCHE, HAUT, SAUT, SPECIAL, ULTIME, type Entree,
} from "../../noyau/entrees";

/*
 * Clavier → entrée du tick.
 *
 * On lit `event.code`, la position physique de la touche : ZQSD sur un
 * clavier AZERTY et WASD sur un QWERTY tombent au même endroit. Deux
 * dispositions coexistent : main gauche sur ZQSD (actions J K L), ou main
 * droite sur les flèches (actions X C V) ; Espace et Maj servent aux deux.
 */

const TOUCHES: Record<string, Entree> = {
  KeyA: GAUCHE, KeyD: DROITE, KeyW: HAUT, KeyS: BAS,
  ArrowLeft: GAUCHE, ArrowRight: DROITE, ArrowUp: HAUT, ArrowDown: BAS,
  Space: SAUT,
  ShiftLeft: DASH, ShiftRight: DASH,
  KeyJ: ATTAQUE, KeyK: SPECIAL, KeyL: ULTIME,
  KeyX: ATTAQUE, KeyC: SPECIAL, KeyV: ULTIME,
};

export type Clavier = {
  /** Entrée du prochain tick. */
  entree(): Entree;
  arreter(): void;
};

export function ecouterClavier(cible: Window, raccourcis: Record<string, () => void> = {}): Clavier {
  const tenues = new Set<string>();
  // Une touche pressée puis relâchée entre deux ticks compte quand même
  // pour le tick suivant : un appui très bref ne se perd pas.
  let appuis: Entree = 0;

  const bas = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (Object.hasOwn(raccourcis, e.code) && !e.repeat) {
      e.preventDefault();
      raccourcis[e.code]();
      return;
    }
    if (!Object.hasOwn(TOUCHES, e.code)) return;
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
