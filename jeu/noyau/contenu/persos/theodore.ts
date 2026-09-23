import { px } from "../../constantes";
import type { PersoDef } from "../../definitions";
import { elan, frappe, touche } from "../outils";

/*
 * Absolut Théodore — délégué de classe, costume noir, passionné d'urbex,
 * esthétique « Absolut Cinema ». Un assassin : le plus mobile de tous
 * (triple saut, deux dashs en l'air), des pièges, des attaques surprises
 * (passe-muraille qui marque, lampe qui éblouit, grappin), mais le moins
 * résistant. Son ultime tourne une scène.
 */

export const THEODORE: PersoDef = {
  id: "theodore",
  nom: "Absolut Théodore",
  stats: {
    pv: 1350,
    poids: 86,
    largeur: px(54),
    hauteur: px(122),
    vitesseSol: px(9),
    accelerationSol: px(1.6),
    freinageSol: px(1.8),
    vitesseAir: px(8),
    accelerationAir: px(0.8),
    freinageAir: px(0.25),
    gravite: px(0.9),
    vitesseChuteMax: px(16),
    vitesseChuteRapide: px(24),
    impulsionSaut: px(18),
    impulsionDoubleSaut: px(16.5),
    sautsAeriens: 2,
    dashVitesse: px(26),
    dashDuree: 8,
    dashRecharge: 18,
    dashsAeriens: 2,
    dashInvulnerable: 7,
  },
  coups: {
    // Clap : trois coups secs de clap de cinéma.
    neutre: {
      duree: 14,
      suite: { coup: "neutre2", de: 5, a: 13 },
      hitboxes: [frappe({ de: 3, a: 5, x: 54, y: 86, l: 62, h: 36, degats: 24, recul: 3, croissance: 2, angle: 30, hitstun: 14 })],
    },
    neutre2: {
      duree: 14,
      suite: { coup: "neutre3", de: 5, a: 13 },
      hitboxes: [frappe({ de: 3, a: 5, x: 56, y: 80, l: 64, h: 36, degats: 24, recul: 3, croissance: 2, angle: 30, hitstun: 14 })],
    },
    neutre3: {
      duree: 24,
      hitboxes: [frappe({ de: 6, a: 8, x: 62, y: 82, l: 82, h: 44, degats: 48, recul: 10, croissance: 8, angle: 40, hitstun: 24 })],
    },
    // Travelling : il fond sur sa cible.
    cote: {
      duree: 30,
      mouvement: [elan(3, 10, { vx: 16 })],
      hitboxes: [frappe({ de: 6, a: 11, x: 50, y: 76, l: 82, h: 50, degats: 72, recul: 11, croissance: 9, angle: 30, hitstun: 24 })],
    },
    // Contre-plongée : coup de pied retourné vers le haut.
    haut: {
      duree: 28,
      hitboxes: [frappe({ de: 5, a: 10, x: 10, y: 140, l: 92, h: 92, degats: 58, recul: 12, croissance: 8, angle: 82, hitstun: 24 })],
    },
    // Pied-de-biche : balayage au ras du sol.
    bas: {
      duree: 26,
      hitboxes: [frappe({ de: 6, a: 9, x: 68, y: 14, l: 106, h: 28, degats: 56, recul: 9, croissance: 7, angle: 28, hitstun: 24 })],
    },
    // Plan-séquence : vrille aérienne.
    air_neutre: {
      duree: 26,
      atterrissage: 6,
      hitboxes: [frappe({ de: 4, a: 12, x: 0, y: 60, l: 132, h: 122, degats: 46, recul: 7, croissance: 6, angle: 45, hitstun: 20 })],
    },
    // Plongée : coup de pied en piqué, en diagonale.
    air_bas: {
      duree: 34,
      atterrissage: 12,
      mouvement: [elan(6, 20, { vx: 10, vy: 16 })],
      hitboxes: [frappe({ de: 6, a: 20, x: 20, y: 0, l: 72, h: 60, degats: 62, recul: 10, croissance: 8, angle: -45, hitstun: 24 })],
    },
    // Lampe torche : l'adversaire, ébloui, reste figé un instant.
    special_neutre: {
      duree: 34,
      recharge: 200,
      hitboxes: [frappe({ de: 10, a: 14, x: 132, y: 90, l: 204, h: 112, degats: 18, recul: 0, angle: 0, hitstun: 0, statut: "ebloui" })],
    },
    // Passe-muraille : il traverse, invisible, et marque qui il croise.
    special_cote: {
      duree: 30,
      recharge: 110,
      unParSaut: true,
      invulnerable: [2, 14],
      mouvement: [elan(4, 11, { vx: 34, vy: 0, gravite: 0 })],
      hitboxes: [frappe({ de: 4, a: 11, x: 0, y: 60, l: 72, h: 122, degats: 16, recul: 0, angle: 0, hitstun: 0, statut: "marque" })],
    },
    // Grappin : accroché à un bord, il s'y hisse.
    special_haut: {
      duree: 60,
      unParSaut: true,
      atterrissage: 14,
      mouvement: [elan(0, 2, { vx: 0, vy: 0 }), elan(3, 59, { vx: 0, gravite: 250 })],
      entites: [{ frame: 3, id: "grappin", x: px(20), y: px(100) }],
    },
    // Fil tendu : un piège d'urbexeur.
    special_bas: { duree: 26, recharge: 90, entites: [{ frame: 10, id: "fil", x: px(72), y: px(10) }] },
    // Absolut Cinema : s'il atteint sa cible, la scène commence.
    ultime: {
      duree: 44,
      jauge: 1000,
      invulnerable: [0, 14],
      surTouche: { coup: "ultime_scene" },
      mouvement: [elan(6, 16, { vx: 22 })],
      hitboxes: [frappe({ de: 6, a: 16, x: 40, y: 70, l: 92, h: 112, degats: 20, recul: 2, angle: 80, hitstun: 90, gel: 8 })],
    },
    ultime_scene: {
      duree: 120,
      ultime: true,
      armure: [0, 119],
      mouvement: [elan(0, 119, { vx: 0 })],
      hitboxes: [
        ...[14, 26, 38, 50, 62].map((de, groupe) =>
          frappe({ de, a: de + 2, groupe, x: 40, y: 80, l: 152, h: 172, degats: 26, recul: 2, angle: 88, hitstun: 50, gel: 6 })),
        frappe({ de: 88, a: 92, groupe: 5, x: 50, y: 90, l: 172, h: 190, degats: 140, recul: 23, croissance: 12, angle: 35, hitstun: 60, gel: 20 }),
      ],
    },
  },
  entites: {
    grappin: {
      l: px(26), h: px(26), duree: 28, vx: px(22), vy: px(-22), solides: "arreter", grappin: { vitesse: px(26) },
      touchesMax: 1, touche: touche({ degats: 26, recul: 9, angle: 160, hitstun: 22 }),
    },
    fil: {
      l: px(120), h: px(16), duree: 900, gravite: px(1.2), solides: "arreter", max: 2,
      declencheur: { rayon: px(70), armement: 45 }, surFin: "fil_declenche",
    },
    fil_declenche: {
      l: px(140), h: px(80), duree: 5,
      touche: touche({ degats: 46, recul: 12, croissance: 6, angle: 82, hitstun: 34 }),
    },
  },
};
