import { bloc, type Carte } from "./carte";
import type { StatsCombattant } from "./combattant";
import { px } from "./constantes";
import { creerMonde, type Monde } from "./monde";

/*
 * Contenu provisoire du prototype : une arène fermée et un « mannequin »,
 * simple boîte sans attaque. Ce ne sont ni une vraie carte ni un vrai
 * personnage : ils servent à régler la sensation de déplacement.
 */

export const ARENE_BAC_A_SABLE: Carte = {
  limites: bloc(0, 0, 3200, 1400),
  solides: [
    bloc(0, 1200, 3200, 200),   // sol
    bloc(0, 0, 40, 1200),       // mur gauche
    bloc(3160, 0, 40, 1200),    // mur droit
    bloc(1100, 1000, 320, 40),  // 200 px au-dessus du sol : double saut nécessaire
    bloc(1700, 840, 320, 40),   // 160 px au-dessus du précédent : un saut suffit
  ],
  apparitions: [{ x: px(400), y: px(1200) }],
};

/* Saut : 171 px ; double saut depuis l'apogée : +134 px ; dash : 198 px en 9 ticks. */
export const MANNEQUIN: StatsCombattant = {
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
  impulsionSaut: px(18),
  impulsionDoubleSaut: px(16),
  sautsAeriens: 1,
  dashVitesse: px(22),
  dashDuree: 9,
  dashRecharge: 30,
  dashsAeriens: 1,
};

export function creerMondeBacASable(): Monde {
  return creerMonde(ARENE_BAC_A_SABLE, [MANNEQUIN]);
}
