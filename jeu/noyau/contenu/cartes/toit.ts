import { bloc, plateforme, point, type Carte } from "../../carte";

/*
 * Toit de l'usine (urbex) : un grand toit bas à gauche, un toit plus haut
 * à droite, une cheminée à franchir, des passerelles étagées au-dessus
 * du vide qui les sépare.
 */

export const TOIT: Carte = {
  id: "toit",
  nom: "Toit de l'usine",
  limites: bloc(0, 0, 3400, 1600),
  zoneVie: bloc(-600, -700, 4600, 2900),
  solides: [bloc(300, 1100, 1300, 360), bloc(1850, 950, 1050, 510), bloc(1130, 960, 110, 140)],
  plateformes: [plateforme(640, 830, 280), plateforme(1560, 760, 260), plateforme(2250, 700, 300)],
  apparitions: [point(600, 1100), point(2600, 950), point(900, 1100), point(2150, 950)],
};
