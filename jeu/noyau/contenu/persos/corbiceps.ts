import { px } from "../../constantes";
import type { PersoDef } from "../../definitions";
import { elan, frappe } from "../outils";

/*
 * Mr Corbiceps — professeur de mathématiques, rugbyman, bâti comme un
 * pilier. Lourd, puissant, au corps à corps ; peu mobile mais chaque
 * coup fait mal.
 *
 * Signature : l'enchaînement « oui, non, non, oui » (quatre appuis sur
 * attaque), le plaquage en armure, l'uppercut Σ, le ∏ chargé, le contre
 * « Non. » et un ultime dont les coups suivent la suite de Fibonacci.
 */

export const CORBICEPS: PersoDef = {
  id: "corbiceps",
  nom: "Mr Corbiceps",
  fiche: {
    role: "Lourd · corps à corps",
    resume: "Prof de maths bâti comme un pilier. Lent, mais chaque coup fait mal : « oui, non, non, oui ! »",
    couleur: 0xff4d5a,
  },
  stats: {
    pv: 1550,
    poids: 135,
    largeur: px(76),
    hauteur: px(128),
    vitesseSol: px(6.4),
    accelerationSol: px(0.9),
    freinageSol: px(1.4),
    vitesseAir: px(5.6),
    accelerationAir: px(0.45),
    freinageAir: px(0.18),
    gravite: px(1),
    vitesseChuteMax: px(17),
    vitesseChuteRapide: px(24),
    impulsionSaut: px(17.5),
    impulsionDoubleSaut: px(14.5),
    sautsAeriens: 1,
    dashVitesse: px(18),
    dashDuree: 10,
    dashRecharge: 40,
    dashsAeriens: 1,
    dashInvulnerable: 5,
  },
  coups: {
    // « Oui, non, non, oui ! » : quatre coups de poing, le dernier projette.
    neutre: {
      duree: 18,
      suite: { coup: "neutre2", de: 6, a: 17 },
      hitboxes: [frappe({ de: 5, a: 7, x: 60, y: 82, l: 64, h: 40, degats: 36, recul: 4, croissance: 2, angle: 28, hitstun: 17 })],
    },
    neutre2: {
      duree: 18,
      suite: { coup: "neutre3", de: 6, a: 17 },
      hitboxes: [frappe({ de: 5, a: 7, x: 62, y: 80, l: 66, h: 40, degats: 36, recul: 4, croissance: 2, angle: 28, hitstun: 17 })],
    },
    neutre3: {
      duree: 20,
      suite: { coup: "neutre4", de: 7, a: 19 },
      hitboxes: [frappe({ de: 6, a: 8, x: 60, y: 84, l: 70, h: 44, degats: 40, recul: 4, croissance: 2, angle: 30, hitstun: 19 })],
    },
    neutre4: {
      duree: 34,
      hitboxes: [frappe({ de: 10, a: 14, x: 66, y: 84, l: 92, h: 64, degats: 90, recul: 13, croissance: 12, angle: 40, hitstun: 30, gel: 10 })],
    },
    // Plaquage : charge d'épaule, en armure pendant l'élan.
    cote: {
      duree: 40,
      armure: [4, 16],
      mouvement: [elan(8, 18, { vx: 13 })],
      hitboxes: [frappe({ de: 10, a: 18, x: 50, y: 62, l: 82, h: 92, degats: 110, recul: 15, croissance: 14, angle: 32, hitstun: 32, gel: 11 })],
    },
    // Uppercut Σ : le meilleur anti-aérien du personnage.
    haut: {
      duree: 34,
      hitboxes: [frappe({ de: 8, a: 12, x: 32, y: 152, l: 92, h: 92, degats: 95, recul: 14, croissance: 11, angle: 82, hitstun: 30, gel: 10 })],
    },
    // Mêlée : il frappe le sol, l'onde touche des deux côtés.
    bas: {
      duree: 38,
      hitboxes: [
        frappe({ de: 12, a: 15, x: 72, y: 16, l: 112, h: 34, degats: 80, recul: 10, croissance: 9, angle: 70, hitstun: 28 }),
        frappe({ de: 12, a: 15, x: -62, y: 16, l: 92, h: 34, degats: 80, recul: 10, croissance: 9, angle: 110, hitstun: 28 }),
      ],
    },
    // Cercle trigonométrique : double lariat en tournant.
    air_neutre: {
      duree: 32,
      atterrissage: 8,
      hitboxes: [frappe({ de: 6, a: 16, x: 0, y: 72, l: 172, h: 104, degats: 60, recul: 8, croissance: 7, angle: 45, hitstun: 22 })],
    },
    // Produit vectoriel : direct aérien.
    air_cote: {
      duree: 30,
      atterrissage: 9,
      hitboxes: [frappe({ de: 8, a: 11, x: 62, y: 74, l: 82, h: 52, degats: 70, recul: 11, croissance: 9, angle: 35, hitstun: 24 })],
    },
    // Récurrence : coup de tête vers le haut.
    air_haut: {
      duree: 28,
      atterrissage: 7,
      hitboxes: [frappe({ de: 6, a: 10, x: 8, y: 150, l: 84, h: 72, degats: 62, recul: 10, croissance: 8, angle: 85, hitstun: 22 })],
    },
    // Intégrale : il plonge talons en avant et enfonce la cible.
    air_bas: {
      duree: 36,
      atterrissage: 16,
      mouvement: [elan(8, 20, { vy: 16 })],
      hitboxes: [frappe({ de: 10, a: 20, x: 0, y: -8, l: 92, h: 62, degats: 85, recul: 12, croissance: 9, angle: -65, hitstun: 28, gel: 10 })],
    },
    // ∏ : coup de poing chargé (bouton tenu), armé dès le départ.
    special_neutre: {
      duree: 46,
      recharge: 90,
      armure: [0, 8],
      charge: { frame: 8, max: 70, bonus: 1300 },
      hitboxes: [frappe({ de: 13, a: 16, x: 70, y: 78, l: 92, h: 58, degats: 100, recul: 15, croissance: 16, angle: 30, hitstun: 34, gel: 12 })],
    },
    // Transformation d'essai : course ballon en main, en armure.
    special_cote: {
      duree: 56,
      recharge: 150,
      unParSaut: true,
      armure: [6, 40],
      annulable: 44,
      mouvement: [elan(8, 40, { vx: 15 })],
      hitboxes: [frappe({ de: 10, a: 40, x: 48, y: 64, l: 82, h: 104, degats: 85, recul: 16, croissance: 12, angle: 35, hitstun: 32, gel: 10 })],
    },
    // Saut de ligne : récupération verticale.
    special_haut: {
      duree: 44,
      unParSaut: true,
      atterrissage: 18,
      mouvement: [elan(4, 18, { vx: 4, vy: -21 })],
      hitboxes: [frappe({ de: 5, a: 16, x: 20, y: 122, l: 92, h: 122, degats: 70, recul: 12, croissance: 8, angle: 80, hitstun: 26 })],
    },
    // « Non. » : garde fermée ; touché pendant la fenêtre, il riposte.
    special_bas: {
      duree: 44,
      recharge: 120,
      contre: { de: 3, a: 22, riposte: "riposte" },
    },
    riposte: {
      duree: 30,
      invulnerable: [0, 8],
      hitboxes: [frappe({ de: 4, a: 7, x: 64, y: 78, l: 104, h: 72, degats: 120, recul: 17, croissance: 14, angle: 38, hitstun: 34, gel: 14 })],
    },
    // Série divergente : un bond ; s'il touche, une série dont les dégâts
    // suivent Fibonacci, conclue par « +∞ ».
    ultime: {
      duree: 40,
      jauge: 1000,
      armure: [0, 39],
      surTouche: { coup: "ultime_serie" },
      mouvement: [elan(6, 18, { vx: 15 })],
      hitboxes: [frappe({ de: 8, a: 18, x: 50, y: 72, l: 104, h: 104, degats: 30, recul: 2, angle: 80, hitstun: 70, gel: 6 })],
    },
    ultime_serie: {
      duree: 110,
      ultime: true,
      armure: [0, 109],
      // Il s'arrête net : lancé par le bond, il traverserait sa cible.
      mouvement: [elan(0, 109, { vx: 0 })],
      hitboxes: [
        ...[10, 22, 34, 46, 58].map((de, groupe) =>
          frappe({ de, a: de + 2, groupe, x: 44, y: 100, l: 150, h: 170, degats: [20, 30, 50, 80, 110][groupe], recul: 2, angle: 88, hitstun: 45, gel: 6 })),
        frappe({ de: 80, a: 84, groupe: 5, x: 50, y: 100, l: 170, h: 190, degats: 150, recul: 24, croissance: 12, angle: 40, hitstun: 60, gel: 22 }),
      ],
    },
  },
};
