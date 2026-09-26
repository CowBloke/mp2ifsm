import {
  ATTAQUE, BAS, DASH, DROITE, GAUCHE, HAUT, SAUT, SPECIAL, ULTIME, type Entree,
} from "../../noyau/entrees";

/*
 * Commandes tactiles (téléphone, tablette) → entrée du tick.
 *
 * Moitié gauche de l'écran : un stick « flottant », qui naît là où le
 * pouce se pose. Moitié droite : cinq boutons, disposés comme sur une
 * manette ; un doigt peut glisser d'un bouton à l'autre. Tout passe par
 * les Pointer Events, en multi-touch. Les commandes n'apparaissent
 * qu'avec un écran tactile (pointeur grossier) ou dès le premier toucher.
 */

/** Part du déplacement qu'un axe doit porter pour compter : l'horizontale est large, pour qu'un pouce qui marche ne traverse pas une plateforme par mégarde. */
const PART_HORIZONTALE = 0.38;
const PART_VERTICALE = 0.6;
const ZONE_MORTE = 16;
/** Course maximale du bouton du stick, en px CSS. */
const COURSE = 56;

/** Direction du stick virtuel, d'après le déplacement du doigt depuis son point de départ (px CSS, y vers le bas). */
export function directionStick(dx: number, dy: number, zoneMorte = ZONE_MORTE): Entree {
  const d = Math.hypot(dx, dy);
  if (d < zoneMorte) return 0;
  let e: Entree = 0;
  if (dx > d * PART_HORIZONTALE) e |= DROITE;
  else if (dx < -d * PART_HORIZONTALE) e |= GAUCHE;
  if (dy > d * PART_VERTICALE) e |= BAS;
  else if (dy < -d * PART_VERTICALE) e |= HAUT;
  return e;
}

type Bouton = { bit: Entree; libelle: string; droite: number; bas: number; taille: number; couleur: string };

/** Position depuis le coin bas-droit (px CSS), comme les boutons d'une manette. */
const BOUTONS: readonly Bouton[] = [
  { bit: SAUT, libelle: "Saut", droite: 22, bas: 22, taille: 78, couleur: "61,220,132" },
  { bit: ATTAQUE, libelle: "Attaque", droite: 112, bas: 16, taille: 78, couleur: "255,90,95" },
  { bit: SPECIAL, libelle: "Spécial", droite: 94, bas: 106, taille: 66, couleur: "79,140,255" },
  { bit: DASH, libelle: "Dash", droite: 16, bas: 114, taille: 58, couleur: "170,180,216" },
  { bit: ULTIME, libelle: "Ultime", droite: 176, bas: 100, taille: 56, couleur: "255,209,102" },
];

export type Tactile = {
  /** Entrée du prochain tick. */
  entree(): Entree;
  /** Montrer les commandes (pas pour un spectateur, ni pendant l'écran des résultats). */
  afficher(v: boolean): void;
  /** Le bouton d'ultime s'illumine quand la jauge est pleine. */
  ultimePret(v: boolean): void;
  /** Largeur (px CSS) que les commandes occupent de chaque côté, en bas, quand elles sont visibles. */
  emprise(): number;
  arreter(): void;
};

function cercle(taille: number, fond: string, bord: string): HTMLDivElement {
  const d = document.createElement("div");
  Object.assign(d.style, {
    position: "absolute", width: `${taille}px`, height: `${taille}px`, borderRadius: "50%",
    background: fond, border: `2px solid ${bord}`, boxSizing: "border-box", pointerEvents: "none",
  });
  return d;
}

export function creerTactile(conteneur: HTMLElement, fenetre: Window = window): Tactile {
  const calque = document.createElement("div");
  Object.assign(calque.style, {
    position: "absolute", inset: "0", zIndex: "1", touchAction: "none", userSelect: "none",
    webkitUserSelect: "none", webkitTouchCallout: "none", display: "none",
  });
  calque.setAttribute("aria-hidden", "true");
  conteneur.appendChild(calque);

  // Stick : une base et son bouton ; au repos, la base attend en bas à gauche.
  const base = cercle(2 * COURSE + 12, "rgba(255,255,255,0.06)", "rgba(255,255,255,0.28)");
  const pouce = cercle(54, "rgba(255,255,255,0.28)", "rgba(255,255,255,0.6)");
  calque.append(base, pouce);

  const boutons = BOUTONS.map((b) => {
    const el = cercle(b.taille, `rgba(${b.couleur},0.18)`, `rgba(${b.couleur},0.75)`);
    Object.assign(el.style, {
      right: `calc(${b.droite}px + env(safe-area-inset-right, 0px))`, bottom: `calc(${b.bas}px + env(safe-area-inset-bottom, 0px))`,
      display: "grid", placeItems: "center", color: "rgba(255,255,255,0.92)",
      font: `800 ${b.taille > 70 ? 13 : 11}px system-ui, sans-serif`, letterSpacing: "0.02em", textShadow: "0 1px 2px #000",
    });
    el.textContent = b.libelle;
    calque.appendChild(el);
    return { ...b, el };
  });

  let modeTactile = fenetre.matchMedia?.("(pointer: coarse)").matches ?? false;
  let voulu = true;
  let tenus: Entree = 0;
  // Un appui plus bref qu'un tick compte quand même pour le tick suivant.
  let appuis: Entree = 0;
  let stick: { id: number; x0: number; y0: number; dir: Entree } | null = null;
  const doigts = new Map<number, Bouton | null>();

  function placerStick(x: number, y: number, dx = 0, dy = 0) {
    const r = COURSE + 6;
    base.style.left = `${x - r}px`;
    base.style.top = `${y - r}px`;
    const d = Math.hypot(dx, dy);
    const k = d > COURSE ? COURSE / d : 1;
    pouce.style.left = `${x + dx * k - 27}px`;
    pouce.style.top = `${y + dy * k - 27}px`;
  }

  function stickAuRepos() {
    const h = calque.clientHeight || fenetre.innerHeight;
    placerStick(COURSE + 34, h - COURSE - 34);
    base.style.opacity = "0.55";
    pouce.style.opacity = "0.55";
  }

  function boutonSous(x: number, y: number): Bouton | null {
    let meilleur: Bouton | null = null;
    let dMin = Infinity;
    for (const b of boutons) {
      const r = b.el.getBoundingClientRect();
      const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      // Un peu de marge autour du bouton : le pouce n'est pas précis.
      if (d <= (r.width / 2) * 1.2 && d < dMin) {
        dMin = d;
        meilleur = b;
      }
    }
    return meilleur;
  }

  function recalculer() {
    let e: Entree = 0;
    for (const b of doigts.values()) if (b) e |= b.bit;
    for (const b of boutons) {
      const actif = (e & b.bit) !== 0;
      b.el.style.background = `rgba(${b.couleur},${actif ? 0.55 : 0.18})`;
      b.el.style.transform = actif ? "scale(0.94)" : "";
    }
    tenus = e | (stick?.dir ?? 0);
  }

  const local = (e: PointerEvent) => {
    const r = calque.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const poser = (e: PointerEvent) => {
    if (e.pointerType === "mouse") return;
    e.preventDefault();
    const p = local(e);
    if (p.x < calque.clientWidth * 0.45) {
      if (stick) return;
      stick = { id: e.pointerId, x0: p.x, y0: p.y, dir: 0 };
      base.style.opacity = "1";
      pouce.style.opacity = "1";
      placerStick(p.x, p.y);
    } else {
      const b = boutonSous(e.clientX, e.clientY);
      doigts.set(e.pointerId, b);
      if (b) {
        appuis |= b.bit;
        fenetre.navigator.vibrate?.(8);
      }
    }
    calque.setPointerCapture?.(e.pointerId);
    recalculer();
  };

  const bouger = (e: PointerEvent) => {
    if (stick && e.pointerId === stick.id) {
      const p = local(e);
      const dx = p.x - stick.x0;
      const dy = p.y - stick.y0;
      stick.dir = directionStick(dx, dy);
      placerStick(stick.x0, stick.y0, dx, dy);
      recalculer();
      return;
    }
    if (!doigts.has(e.pointerId)) return;
    const b = boutonSous(e.clientX, e.clientY);
    if (b !== doigts.get(e.pointerId)) {
      doigts.set(e.pointerId, b);
      if (b) appuis |= b.bit;
      recalculer();
    }
  };

  const lever = (e: PointerEvent) => {
    if (stick && e.pointerId === stick.id) {
      stick = null;
      stickAuRepos();
    }
    doigts.delete(e.pointerId);
    recalculer();
  };

  // Premier toucher sur un écran qu'on croyait sans tactile : les commandes apparaissent.
  const decouvrir = (e: PointerEvent) => {
    if (e.pointerType !== "touch" || modeTactile) return;
    modeTactile = true;
    majAffichage();
  };

  function majAffichage() {
    const visible = modeTactile && voulu;
    calque.style.display = visible ? "block" : "none";
    if (!visible) {
      stick = null;
      doigts.clear();
      recalculer();
    } else {
      stickAuRepos();
    }
  }

  calque.addEventListener("pointerdown", poser);
  calque.addEventListener("pointermove", bouger);
  calque.addEventListener("pointerup", lever);
  calque.addEventListener("pointercancel", lever);
  calque.addEventListener("contextmenu", (e) => e.preventDefault());
  fenetre.addEventListener("pointerdown", decouvrir, true);
  const redimensionner = () => {
    if (!stick) stickAuRepos();
  };
  fenetre.addEventListener("resize", redimensionner);
  majAffichage();

  return {
    entree() {
      const e = tenus | appuis;
      appuis = 0;
      return e;
    },
    afficher(v) {
      if (v === voulu) return;
      voulu = v;
      majAffichage();
    },
    ultimePret(v) {
      const b = boutons.find((x) => x.bit === ULTIME)!;
      b.el.style.boxShadow = v ? "0 0 18px 4px rgba(255,209,102,0.75)" : "";
      b.el.style.borderColor = v ? "rgba(255,209,102,1)" : `rgba(${b.couleur},0.75)`;
    },
    emprise() {
      return modeTactile && voulu ? 250 : 0;
    },
    arreter() {
      fenetre.removeEventListener("pointerdown", decouvrir, true);
      fenetre.removeEventListener("resize", redimensionner);
      calque.remove();
    },
  };
}
