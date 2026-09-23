import { px } from "../../constantes";
import type { PersoDef } from "../../definitions";
import { elan, frappe, touche } from "../outils";

/*
 * Mr Pricou — professeur de physique, grand, savant fou. Il contrôle
 * l'espace à distance : électrons, fiole en parabole qui laisse une
 * flaque ralentissante, aimant piège, et un trou noir en guise d'ultime.
 * Au corps à corps, il est plus fragile que les autres.
 */

export const PRICOU: PersoDef = {
  id: "pricou",
  nom: "Mr Pricou",
  stats: {
    pv: 1300,
    poids: 92,
    largeur: px(58),
    hauteur: px(126),
    vitesseSol: px(7.2),
    accelerationSol: px(1.1),
    freinageSol: px(1.5),
    vitesseAir: px(7),
    accelerationAir: px(0.7),
    freinageAir: px(0.2),
    gravite: px(0.8),
    vitesseChuteMax: px(14),
    vitesseChuteRapide: px(20),
    impulsionSaut: px(17),
    impulsionDoubleSaut: px(15.5),
    sautsAeriens: 1,
    dashVitesse: px(21),
    dashDuree: 9,
    dashRecharge: 32,
    dashsAeriens: 1,
    dashInvulnerable: 6,
  },
  coups: {
    // Coup de règle, puis revers.
    neutre: {
      duree: 16,
      suite: { coup: "neutre2", de: 6, a: 15 },
      hitboxes: [frappe({ de: 4, a: 6, x: 60, y: 84, l: 74, h: 26, degats: 26, recul: 4, croissance: 2, angle: 30, hitstun: 15 })],
    },
    neutre2: {
      duree: 24,
      hitboxes: [frappe({ de: 6, a: 8, x: 66, y: 80, l: 86, h: 30, degats: 42, recul: 9, croissance: 7, angle: 38, hitstun: 24 })],
    },
    // Pendule de Foucault : une masse au bout d'un fil, longue portée.
    cote: {
      duree: 34,
      hitboxes: [frappe({ de: 10, a: 14, x: 98, y: 58, l: 124, h: 60, degats: 70, recul: 12, croissance: 11, angle: 32, hitstun: 28 })],
    },
    // Arc électrique au-dessus de la tête : deux décharges.
    haut: {
      duree: 30,
      hitboxes: [
        frappe({ de: 7, a: 9, groupe: 0, x: 18, y: 150, l: 110, h: 70, degats: 24, recul: 3, angle: 88, hitstun: 20, gel: 4 }),
        frappe({ de: 12, a: 15, groupe: 1, x: 18, y: 166, l: 124, h: 82, degats: 44, recul: 12, croissance: 9, angle: 86, hitstun: 28 }),
      ],
    },
    // Onde stationnaire : un ventre de chaque côté.
    bas: {
      duree: 30,
      hitboxes: [
        frappe({ de: 9, a: 12, x: 72, y: 14, l: 94, h: 28, degats: 44, recul: 8, croissance: 6, angle: 60, hitstun: 24 }),
        frappe({ de: 9, a: 12, x: -72, y: 14, l: 94, h: 28, degats: 44, recul: 8, croissance: 6, angle: 120, hitstun: 24 }),
      ],
    },
    // Champ électrostatique autour de lui.
    air_neutre: {
      duree: 30,
      atterrissage: 8,
      hitboxes: [frappe({ de: 6, a: 15, x: 0, y: 62, l: 150, h: 150, degats: 46, recul: 8, croissance: 6, angle: 50, hitstun: 22 })],
    },
    // g = 9,81 : il plonge et écrase.
    air_bas: {
      duree: 38,
      atterrissage: 14,
      mouvement: [elan(6, 22, { vy: 18 })],
      hitboxes: [frappe({ de: 8, a: 22, x: 0, y: -6, l: 82, h: 56, degats: 62, recul: 11, croissance: 8, angle: -80, hitstun: 26 })],
    },
    special_neutre: { duree: 30, recharge: 55, entites: [{ frame: 10, id: "electron", x: px(40), y: px(86) }] },
    special_cote: { duree: 34, recharge: 150, entites: [{ frame: 12, id: "fiole", x: px(30), y: px(112) }] },
    // Troisième loi de Newton : une explosion sous ses pieds le propulse.
    special_haut: {
      duree: 42,
      unParSaut: true,
      atterrissage: 16,
      mouvement: [elan(4, 16, { vx: 2, vy: -22 })],
      entites: [{ frame: 4, id: "propulsion", x: 0, y: px(-8) }],
    },
    special_bas: { duree: 30, recharge: 150, entites: [{ frame: 12, id: "aimant", x: px(64), y: px(24) }] },
    // Trou noir : attire tout le monde, puis explose.
    ultime: {
      duree: 70,
      jauge: 1000,
      armure: [0, 40],
      entites: [{ frame: 24, id: "trou_noir", x: px(260), y: px(120) }],
    },
  },
  entites: {
    electron: {
      l: px(34), h: px(34), duree: 80, vx: px(12.5), solides: "detruire", touchesMax: 1, max: 2,
      touche: touche({ degats: 44, recul: 7, croissance: 5, angle: 25, hitstun: 20 }),
    },
    fiole: {
      l: px(30), h: px(36), duree: 150, vx: px(8.5), vy: px(-10), gravite: px(0.55), solides: "detruire",
      touchesMax: 1, surFin: "flaque", touche: touche({ degats: 36, recul: 6, angle: 45, hitstun: 18 }),
    },
    flaque: {
      l: px(170), h: px(26), duree: 300, gravite: px(1.2), solides: "arreter", periode: 30, max: 1,
      touche: touche({ degats: 12, recul: 0, angle: 0, hitstun: 0, statut: "ralenti" }),
    },
    propulsion: {
      l: px(110), h: px(80), duree: 6,
      touche: touche({ degats: 48, recul: 10, croissance: 6, angle: -75, hitstun: 22, radial: true }),
    },
    aimant: {
      l: px(46), h: px(24), duree: 900, gravite: px(1.2), solides: "arreter", max: 1,
      declencheur: { rayon: px(95), armement: 40 }, surFin: "champ_magnetique",
    },
    champ_magnetique: {
      l: px(220), h: px(200), duree: 36, attraction: { rayon: px(240), force: px(3) },
      touche: touche({ degats: 34, recul: 0, angle: 0, hitstun: 0, statut: "etourdi" }),
    },
    trou_noir: {
      l: px(90), h: px(90), duree: 150, attraction: { rayon: px(330), force: px(2.6) }, periode: 15, ultime: true,
      surFin: "explosion_trou_noir", touche: touche({ degats: 14, recul: 0, angle: 0, hitstun: 0 }),
    },
    explosion_trou_noir: {
      l: px(360), h: px(360), duree: 8, ultime: true,
      touche: touche({ degats: 150, recul: 19, croissance: 10, angle: 55, hitstun: 44, radial: true }),
    },
  },
};
