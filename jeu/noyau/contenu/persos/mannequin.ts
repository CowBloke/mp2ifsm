import { px } from "../../constantes";
import type { PersoDef } from "../../definitions";
import { elan, frappe } from "../outils";

/*
 * Le mannequin : un combattant générique, sans identité, qui sert de
 * cible d'entraînement et de gabarit. Ses coups couvrent tous les
 * mécanismes du moteur (enchaînement, charge, récupération, armure).
 */

export const MANNEQUIN: PersoDef = {
  id: "mannequin",
  nom: "Mannequin",
  stats: {
    pv: 1400,
    poids: 100,
    largeur: px(60),
    hauteur: px(110),
    vitesseSol: px(8),
    accelerationSol: px(1.2),
    freinageSol: px(1.6),
    vitesseAir: px(7),
    accelerationAir: px(0.6),
    freinageAir: px(0.2),
    gravite: px(0.9),
    vitesseChuteMax: px(16),
    vitesseChuteRapide: px(22),
    impulsionSaut: px(18),
    impulsionDoubleSaut: px(16),
    sautsAeriens: 1,
    dashVitesse: px(22),
    dashDuree: 9,
    dashRecharge: 30,
    dashsAeriens: 1,
    dashInvulnerable: 6,
  },
  coups: {
    neutre: {
      duree: 16,
      suite: { coup: "neutre2", de: 6, a: 15 },
      hitboxes: [frappe({ de: 4, a: 6, x: 48, y: 72, l: 56, h: 30, degats: 30, recul: 4, croissance: 2, angle: 30, hitstun: 14 })],
    },
    neutre2: {
      duree: 22,
      hitboxes: [frappe({ de: 5, a: 7, x: 52, y: 70, l: 64, h: 34, degats: 45, recul: 8, croissance: 6, angle: 35, hitstun: 22 })],
    },
    cote: {
      duree: 30,
      mouvement: [elan(6, 12, { vx: 5 })],
      hitboxes: [frappe({ de: 9, a: 12, x: 62, y: 64, l: 80, h: 40, degats: 80, recul: 12, croissance: 10, angle: 38, hitstun: 28 })],
    },
    haut: {
      duree: 26,
      hitboxes: [frappe({ de: 6, a: 10, x: 12, y: 138, l: 90, h: 60, degats: 60, recul: 11, croissance: 8, angle: 85, hitstun: 26 })],
    },
    bas: {
      duree: 24,
      hitboxes: [frappe({ de: 6, a: 9, x: 56, y: 14, l: 96, h: 28, degats: 50, recul: 7, croissance: 5, angle: 25, hitstun: 22 })],
    },
    air_neutre: {
      duree: 26,
      atterrissage: 6,
      hitboxes: [frappe({ de: 5, a: 14, x: 0, y: 55, l: 130, h: 120, degats: 45, recul: 7, croissance: 6, angle: 45, hitstun: 20 })],
    },
    air_bas: {
      duree: 30,
      atterrissage: 10,
      hitboxes: [frappe({ de: 8, a: 12, x: 8, y: -6, l: 70, h: 50, degats: 70, recul: 9, croissance: 8, angle: -70, hitstun: 24 })],
    },
    special_neutre: {
      duree: 40,
      recharge: 60,
      charge: { frame: 8, max: 60, bonus: 1000 },
      hitboxes: [frappe({ de: 12, a: 15, x: 60, y: 68, l: 70, h: 44, degats: 70, recul: 13, croissance: 14, angle: 32, hitstun: 30 })],
    },
    special_haut: {
      duree: 38,
      unParSaut: true,
      atterrissage: 14,
      mouvement: [elan(3, 16, { vx: 3, vy: -20 })],
      hitboxes: [frappe({ de: 3, a: 14, x: 24, y: 100, l: 80, h: 110, degats: 55, recul: 10, croissance: 6, angle: 80, hitstun: 24 })],
    },
    ultime: {
      duree: 72,
      jauge: 1000,
      armure: [0, 34],
      mouvement: [elan(10, 20, { vx: 14 })],
      hitboxes: [
        ...[14, 20, 26, 32].map((de, groupe) =>
          frappe({ de, a: de + 2, groupe, x: 56, y: 66, l: 90, h: 70, degats: 35, recul: 3, angle: 60, hitstun: 30, gel: 4 })),
        frappe({ de: 42, a: 46, groupe: 4, x: 64, y: 70, l: 110, h: 90, degats: 140, recul: 20, croissance: 12, angle: 38, hitstun: 40, gel: 14 }),
      ],
    },
  },
};
