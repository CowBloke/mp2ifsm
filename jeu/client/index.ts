import { CARTES, PERSOS, PERSOS_ENTRAINEMENT } from "../noyau/contenu";
import { creerMonde } from "../noyau/monde";
import { REGLAGES_STANDARD } from "../noyau/regles";
import type { DebutPartie } from "../protocole/messages";
import type { ConnexionJeu } from "./reseau/connexion";
import { creerSessionReseau } from "./reseau/session-reseau";
import { creerSessionLocale } from "./session-locale";

/*
 * Point d'entrée du client de jeu : le SEUL module que le site importe.
 *
 * Léger (aucun Pixi) : connexion, catalogue des personnages, types. Le
 * rendu, lui, n'est téléchargé qu'au moment d'afficher une partie
 * (`monterJeu`). Aucune logique de jeu ne remonte vers React.
 */

export { connecterJeu, type ConnexionJeu, type EtatConnexion } from "./reseau/connexion";
export { catalogue, type FicheCarte, type FichePerso } from "./catalogue";
export { COULEURS_PLACES } from "./rendu/couleurs";

/** Nom du jeu, affiché dans les menus. */
export const NOM_JEU = "Taupe Fighter";
export type { DebutPartie, EtatSalon, PlaceVue } from "../protocole/messages";

export type OptionsJeu =
  | { mode: "entrainement"; pseudo: string }
  | { mode: "reseau"; connexion: ConnexionJeu; partie: DebutPartie };

export type PartieMontee = {
  detruire(): void;
};

export async function monterJeu(conteneur: HTMLElement, options: OptionsJeu): Promise<PartieMontee> {
  const { monterRendu } = await import("./rendu/monter");
  if (options.mode === "entrainement") {
    const session = creerSessionLocale(
      () => creerMonde(CARTES[0], [PERSOS[0], PERSOS_ENTRAINEMENT[0]], REGLAGES_STANDARD),
      0,
    );
    return monterRendu(conteneur, session, [options.pseudo, "Mannequin"]);
  }
  const session = creerSessionReseau(options.connexion, options.partie);
  return monterRendu(conteneur, session, options.partie.noms);
}
