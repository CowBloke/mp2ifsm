import { px } from "../../constantes";
import type { PersoDef } from "../../definitions";
import { elan, frappe, touche } from "../outils";

/*
 * Souheil Dictador — « Kyllian Dictador » : un footballeur rapide doublé
 * d'un général d'opérette. Présence forte et contrôle : frappe enroulée
 * qui rebondit, porte-voix qui intimide, décret qui réduit au silence, et
 * un discours qui galvanise son camp et écrase les autres. Pure
 * caricature de classe, sans aucun personnage historique réel.
 */

export const SOUHEIL: PersoDef = {
  id: "souheil",
  nom: "Souheil Dictador",
  fiche: {
    role: "Contrôle · pression",
    resume: "Footballeur et général d'opérette : ballon qui rebondit, porte-voix qui intimide, décrets qui font taire.",
    couleur: 0x6f9bff,
  },
  stats: {
    pv: 1500,
    poids: 108,
    largeur: px(62),
    hauteur: px(118),
    vitesseSol: px(8.6),
    accelerationSol: px(1.4),
    freinageSol: px(1.6),
    vitesseAir: px(7.2),
    accelerationAir: px(0.65),
    freinageAir: px(0.22),
    gravite: px(0.95),
    vitesseChuteMax: px(16),
    vitesseChuteRapide: px(23),
    impulsionSaut: px(18),
    impulsionDoubleSaut: px(16),
    sautsAeriens: 1,
    dashVitesse: px(24),
    dashDuree: 9,
    dashRecharge: 26,
    dashsAeriens: 1,
    dashInvulnerable: 6,
  },
  coups: {
    // Contrôle orienté (genou), puis frappe.
    neutre: {
      duree: 16,
      suite: { coup: "neutre2", de: 6, a: 15 },
      hitboxes: [frappe({ de: 4, a: 6, x: 50, y: 50, l: 64, h: 40, degats: 28, recul: 4, croissance: 2, angle: 35, hitstun: 16 })],
    },
    neutre2: {
      duree: 24,
      hitboxes: [frappe({ de: 6, a: 9, x: 62, y: 44, l: 84, h: 44, degats: 52, recul: 10, croissance: 8, angle: 36, hitstun: 25 })],
    },
    // Frappe du gauche.
    cote: {
      duree: 32,
      hitboxes: [frappe({ de: 9, a: 12, x: 68, y: 40, l: 98, h: 50, degats: 88, recul: 13, croissance: 11, angle: 35, hitstun: 28 })],
    },
    // Salut militaire.
    haut: {
      duree: 28,
      hitboxes: [frappe({ de: 6, a: 10, x: 22, y: 150, l: 82, h: 92, degats: 66, recul: 12, croissance: 8, angle: 84, hitstun: 26 })],
    },
    // Tacle glissé : il file au ras du sol et soulève sa cible.
    bas: {
      duree: 36,
      mouvement: [elan(4, 18, { vx: 12 })],
      hitboxes: [frappe({ de: 5, a: 18, x: 46, y: 16, l: 92, h: 32, degats: 56, recul: 11, croissance: 7, angle: 72, hitstun: 28 })],
    },
    // Retourné acrobatique : devant, puis derrière.
    air_neutre: {
      duree: 30,
      atterrissage: 8,
      hitboxes: [
        frappe({ de: 6, a: 10, groupe: 0, x: 52, y: 70, l: 84, h: 62, degats: 50, recul: 9, croissance: 7, angle: 45, hitstun: 22 }),
        frappe({ de: 10, a: 14, groupe: 1, x: -52, y: 70, l: 84, h: 62, degats: 50, recul: 9, croissance: 7, angle: 135, hitstun: 22 }),
      ],
    },
    // Talonnade vers le bas.
    air_bas: {
      duree: 30,
      atterrissage: 11,
      hitboxes: [frappe({ de: 8, a: 12, x: 16, y: -4, l: 72, h: 52, degats: 64, recul: 11, croissance: 8, angle: -60, hitstun: 26 })],
    },
    special_neutre: { duree: 32, recharge: 70, entites: [{ frame: 11, id: "ballon", x: px(40), y: px(28) }] },
    // Porte-voix : pas de gros dégâts, mais l'adversaire frappe moins fort.
    special_cote: {
      duree: 40,
      recharge: 160,
      hitboxes: [frappe({ de: 12, a: 20, x: 112, y: 80, l: 172, h: 120, degats: 22, recul: 10, angle: 18, hitstun: 20, statut: "intimide" })],
    },
    // Envolée du drapeau : récupération.
    special_haut: {
      duree: 40,
      unParSaut: true,
      atterrissage: 16,
      mouvement: [elan(3, 16, { vx: 3, vy: -20 })],
      hitboxes: [frappe({ de: 3, a: 15, x: 18, y: 130, l: 82, h: 120, degats: 56, recul: 11, croissance: 7, angle: 82, hitstun: 24 })],
    },
    // Décret : un parchemin posé au sol ; qui s'y tient est réduit au silence.
    special_bas: { duree: 34, recharge: 300, entites: [{ frame: 14, id: "decret", x: px(120), y: px(66) }] },
    // Discours au balcon : il se galvanise, l'onde domine tout le monde autour.
    ultime: {
      duree: 80,
      jauge: 1000,
      armure: [0, 79],
      statutsSoi: [{ frame: 30, statut: "galvanise" }],
      entites: [{ frame: 30, id: "hymne", x: 0, y: px(80) }],
    },
  },
  entites: {
    ballon: {
      l: px(32), h: px(32), duree: 160, vx: px(12), vy: px(-5), gravite: px(0.6), solides: "rebondir", rebonds: 3,
      touchesMax: 1, max: 1, touche: touche({ degats: 62, recul: 10, croissance: 7, angle: 35, hitstun: 24 }),
    },
    decret: {
      l: px(190), h: px(130), duree: 300, gravite: px(1.2), solides: "arreter", periode: 60, max: 1,
      touche: touche({ degats: 8, recul: 0, angle: 0, hitstun: 0, statut: "silence" }),
    },
    hymne: {
      l: px(760), h: px(460), duree: 10, ultime: true,
      touche: touche({ degats: 45, recul: 12, croissance: 6, angle: 60, hitstun: 26, statut: "domine", radial: true }),
    },
  },
};
