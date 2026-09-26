import { CARTES, PERSOS } from "../noyau/contenu";

/*
 * Ce que les menus affichent des personnages et des cartes : noms,
 * présentation courte, couleur dominante — tirés des fiches des données
 * (PersoDef.fiche). Pur, sans Pixi : il ne doit rien importer des
 * apparences, qui tirent Pixi dans la page.
 */

export type FichePerso = {
  id: string;
  nom: string;
  role: string;
  resume: string;
  /** Couleur dominante, en CSS. */
  couleur: string;
};

export type FicheCarte = { id: string; nom: string };

function css(couleur: number): string {
  return `#${couleur.toString(16).padStart(6, "0")}`;
}

export function catalogue(): { persos: FichePerso[]; cartes: FicheCarte[] } {
  return {
    persos: PERSOS.map((p) => {
      const fiche = p.fiche;
      return {
        id: p.id,
        nom: p.nom,
        role: fiche?.role ?? "",
        resume: fiche?.resume ?? "",
        couleur: css(fiche?.couleur ?? 0xf6f1e7),
      };
    }),
    cartes: CARTES.map((c) => ({ id: c.id, nom: c.nom })),
  };
}
