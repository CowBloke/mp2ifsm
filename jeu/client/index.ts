import { NOMS_NIVEAUX, creerBot } from "../noyau/bots/bot";
import { PERSOS_ENTRAINEMENT, carteParId, persoParId } from "../noyau/contenu";
import { creerMonde } from "../noyau/monde";
import { REGLAGES_STANDARD } from "../noyau/regles";
import type { DebutPartie } from "../protocole/messages";
import type { ConnexionJeu } from "./reseau/connexion";
import { creerSessionReseau } from "./reseau/session-reseau";
import { nomsDistincts } from "./noms";
import { creerSessionLocale } from "./session-locale";
import { PREFERENCES_DEFAUT, type PreferencesJeu } from "./reglages";

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
export { PREFERENCES_DEFAUT, chargerPreferences, enregistrerPreferences, type PreferencesJeu } from "./reglages";
export { NOMS_NIVEAUX };

/** Nom du jeu, affiché dans les menus. */
export const NOM_JEU = "Taupe Fighter";
export type { DebutPartie, EtatSalon, PlaceVue } from "../protocole/messages";

/** Un adversaire d'entraînement : le mannequin immobile, ou un bot d'un niveau donné. */
export type AdversaireEntrainement = { perso: string; niveau: number | null };

export type OptionsEntrainement = {
  pseudo: string;
  perso: string;
  carte: string;
  adversaires: AdversaireEntrainement[];
};

export type OptionsJeu =
  | ({ mode: "entrainement" } & OptionsEntrainement)
  | { mode: "reseau"; connexion: ConnexionJeu; partie: DebutPartie };

export type PartieMontee = {
  detruire(): void;
  preferences(p: PreferencesJeu): void;
  /** Entraînement seulement. */
  pause?(v: boolean): void;
  recommencer?(): void;
};

export async function monterJeu(conteneur: HTMLElement, options: OptionsJeu, preferences: PreferencesJeu): Promise<PartieMontee> {
  const { monterRendu } = await import("./rendu/monter");
  if (options.mode === "entrainement") {
    const { adversaires } = options;
    const persos = [persoParId(options.perso), ...adversaires.map((a) => (a.niveau === null ? PERSOS_ENTRAINEMENT[0] : persoParId(a.perso)))];
    const session = creerSessionLocale(
      () => creerMonde(carteParId(options.carte), persos, REGLAGES_STANDARD),
      0,
      () => {
        const graine = Math.floor(Math.random() * 1e9);
        return [null, ...adversaires.map((a, i) => (a.niveau === null ? null : creerBot(a.niveau, graine + i)))];
      },
    );
    const noms = [options.pseudo, ...adversaires.map((a) => (a.niveau === null ? "Mannequin" : `Bot ${NOMS_NIVEAUX[a.niveau].toLowerCase()}`))];
    return monterRendu(conteneur, session, nomsDistincts(noms), preferences);
  }
  const session = creerSessionReseau(options.connexion, options.partie);
  return monterRendu(conteneur, session, nomsDistincts(options.partie.noms), preferences);
}

export type ApercuMonte = {
  /** Montre un autre personnage (la démonstration repart du début). */
  changer(persoId: string): void;
  detruire(): void;
};

/**
 * Aperçu animé d'un personnage pour les menus : il enchaîne ses coups sur
 * un mannequin, sans interface ni son. Pixi n'est chargé qu'à cet appel.
 */
export async function monterApercu(conteneur: HTMLElement, persoId: string): Promise<ApercuMonte> {
  const [{ monterRendu }, { creerDemo, mondeApercu }] = await Promise.all([import("./rendu/monter"), import("./apercu")]);
  let actuel = persoId;
  // Personne ne joue : la démonstration pilote la place 0, le mannequin ne bouge pas.
  const session = creerSessionLocale(() => mondeApercu(actuel), -1, () => [creerDemo(), null], 0);
  const rendu = await monterRendu(conteneur, session, ["", ""], { ...PREFERENCES_DEFAUT, secousses: false },
    { interface: false, sons: false, vueHauteur: 330 });
  return {
    changer(id) {
      if (id === actuel) return;
      actuel = id;
      session.recommencer?.();
    },
    detruire() {
      rendu.detruire();
    },
  };
}
