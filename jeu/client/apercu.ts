import type { Controleur } from "../noyau/bots/bot";
import { bloc, point, type Carte } from "../noyau/carte";
import { px } from "../noyau/constantes";
import { PERSOS_ENTRAINEMENT, persoParId } from "../noyau/contenu";
import { JAUGE_MAX } from "../noyau/coups";
import { ATTAQUE, BAS, DROITE, GAUCHE, HAUT, SPECIAL, ULTIME, type Entree } from "../noyau/entrees";
import { creerMonde, type Monde } from "../noyau/monde";
import { REGLAGES_STANDARD } from "../noyau/regles";

/*
 * Démonstration d'un personnage pour les menus : une vraie petite
 * simulation où il enchaîne ses coups sur un mannequin. Le contrôleur
 * joue une partition fixe, revient au centre entre deux coups et replace
 * le mannequin à portée : c'est une vitrine, pas une partie (il retouche
 * donc le monde qu'il pilote, ce que rien d'autre ne fait).
 */

/** Petite scène plate : le personnage et son mannequin. */
export const CARTE_APERCU: Carte = {
  id: "apercu",
  nom: "Aperçu",
  limites: bloc(0, 0, 1600, 1000),
  zoneVie: bloc(-1200, -1600, 4000, 3600),
  solides: [bloc(-800, 760, 3200, 600)],
  plateformes: [],
  apparitions: [point(700, 760), point(815, 760)],
};

/** `enchaine` : suite d'un enchaînement, jouée sans attendre la fin du coup en cours. */
type Etape = { entree: Entree; attente: number; ultime?: boolean; enchaine?: boolean };

/** La partition : enchaînement neutre, coups dirigés, spéciaux, puis l'ultime. */
export const DEMO: readonly Etape[] = [
  { entree: ATTAQUE, attente: 9 },
  { entree: ATTAQUE, attente: 9, enchaine: true },
  { entree: ATTAQUE, attente: 45, enchaine: true },
  { entree: DROITE | ATTAQUE, attente: 55 },
  { entree: HAUT | ATTAQUE, attente: 50 },
  { entree: BAS | ATTAQUE, attente: 50 },
  { entree: SPECIAL, attente: 70 },
  { entree: DROITE | SPECIAL, attente: 70 },
  { entree: BAS | SPECIAL, attente: 80 },
  { entree: HAUT | SPECIAL, attente: 90 },
  { entree: ULTIME, attente: 180, ultime: true },
];

const PAUSE_INITIALE = 40;
const DISTANCE = px(115);
/** Au-delà, l'étape part quand même (le personnage n'a pas pu se remettre en place). */
const PATIENCE = 120;

export function mondeApercu(persoId: string): Monde {
  return creerMonde(CARTE_APERCU, [persoParId(persoId), PERSOS_ENTRAINEMENT[0]], {
    ...REGLAGES_STANDARD, dureeDecompte: 0, dureeManche: 0,
  });
}

export function creerDemo(): Controleur {
  let etape = -1;
  let reste = PAUSE_INITIALE;
  let patience = 0;
  const centre = CARTE_APERCU.apparitions[0];

  return (monde, id) => {
    const c = monde.combattants[id];
    const cible = monde.combattants.find((o) => o.id !== id);
    const libre = c.coup === null && c.auSol && c.hitstun === 0;
    // Entre deux coups : retour au centre, puis face au mannequin.
    const seReplacer = (): Entree => {
      if (!libre) return 0;
      if (c.x < centre.x - px(50)) return DROITE;
      if (c.x > centre.x + px(50)) return GAUCHE;
      return c.orientation !== 1 ? DROITE : 0;
    };
    if (reste > 0) {
      reste--;
      return seReplacer();
    }
    const e = DEMO[(etape + 1) % DEMO.length];
    const enPlace = libre && Math.abs(c.x - centre.x) <= px(50) && c.orientation === 1;
    if (!e.enchaine && !enPlace && patience++ < PATIENCE) return seReplacer();

    patience = 0;
    etape = (etape + 1) % DEMO.length;
    reste = e.attente;
    if (cible) {
      const dx = cible.x - c.x;
      if (cible.hitstun > 0 || !cible.auSol || cible.ko || dx < px(70) || dx > px(200)) {
        Object.assign(cible, { x: c.x + DISTANCE, y: centre.y, vx: 0, vy: 0, hitstun: 0, gel: 0, ko: false, horsJeu: false, auSol: true });
      }
      if (cible.pv < cible.perso.stats.pv / 2) cible.pv = cible.perso.stats.pv;
    }
    if (e.ultime) c.jauge = JAUGE_MAX;
    return e.entree;
  };
}
