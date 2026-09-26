import { bloc, plateforme, point, type Carte } from "../../carte";

/*
 * Labo de physique : deux paillasses séparées par un vide (attention aux
 * reculs), une plateforme haute au centre, deux étagères latérales.
 */

export const LABO: Carte = {
  id: "labo",
  nom: "Labo de physique",
  limites: bloc(0, 0, 3000, 1500),
  zoneVie: bloc(-600, -700, 4200, 2800),
  solides: [bloc(420, 1050, 880, 300), bloc(1700, 1050, 880, 300)],
  plateformes: [plateforme(1250, 770, 500), plateforme(560, 820, 260), plateforme(2180, 820, 260)],
  apparitions: [point(700, 1050), point(2300, 1050), point(1000, 1050), point(2000, 1050)],
};
