import { CARTES, PERSOS } from "../noyau/contenu";
import { apparenceDe } from "./persos";

/*
 * Ce que les menus affichent des personnages et des cartes : noms,
 * présentation courte, couleur dominante. Pur, sans Pixi.
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

const PRESENTATIONS: Record<string, { role: string; resume: string }> = {
  corbiceps: {
    role: "Lourd · corps à corps",
    resume: "Prof de maths bâti comme un pilier. Lent, mais chaque coup fait mal : « oui, non, non, oui ! »",
  },
};

function css(couleur: number): string {
  return `#${couleur.toString(16).padStart(6, "0")}`;
}

export function catalogue(): { persos: FichePerso[]; cartes: FicheCarte[] } {
  return {
    persos: PERSOS.map((p) => {
      const ap = apparenceDe(p.id);
      const palette = ap.palettes[0];
      return {
        id: p.id,
        nom: p.nom,
        role: PRESENTATIONS[p.id]?.role ?? "",
        resume: PRESENTATIONS[p.id]?.resume ?? "",
        couleur: css(palette.maillot1 ?? palette.principal ?? ap.etincelles),
      };
    }),
    cartes: CARTES.map((c) => ({ id: c.id, nom: c.nom })),
  };
}
