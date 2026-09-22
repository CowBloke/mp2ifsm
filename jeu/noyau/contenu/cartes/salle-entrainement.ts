import { bloc, plateforme, point, type Carte } from "../../carte";

/*
 * Salle d'entraînement : un plateau flottant, deux plateformes latérales
 * et une plateforme haute, toutes traversables par le dessous.
 */

export const SALLE_ENTRAINEMENT: Carte = {
  id: "salle-entrainement",
  nom: "Salle d'entraînement",
  limites: bloc(0, 100, 2800, 1500),
  zoneVie: bloc(-500, -600, 3800, 2600),
  solides: [bloc(600, 1100, 1600, 260)],
  plateformes: [
    plateforme(820, 880, 360),
    plateforme(1620, 880, 360),
    plateforme(1220, 680, 360),
  ],
  apparitions: [point(900, 1100), point(1900, 1100), point(1250, 1100), point(1550, 1100)],
};
