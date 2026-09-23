import { CARTES, PERSOS } from "../noyau/contenu";

/*
 * Ce que les menus affichent des personnages et des cartes : noms,
 * présentation courte, couleur dominante. Pur, sans Pixi : il ne doit
 * rien importer des apparences, qui tirent Pixi dans la page.
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

/** Présentation des personnages ; la couleur doit rester lisible sur fond sombre. */
const PRESENTATIONS: Record<string, { role: string; resume: string; couleur: number }> = {
  corbiceps: {
    role: "Lourd · corps à corps",
    resume: "Prof de maths bâti comme un pilier. Lent, mais chaque coup fait mal : « oui, non, non, oui ! »",
    couleur: 0xff4d5a,
  },
  pricou: {
    role: "Zone · projectiles",
    resume: "Prof de physique : électrons, fioles, aimants et un trou noir. Fragile de près, redoutable de loin.",
    couleur: 0x5ad1ff,
  },
  souheil: {
    role: "Contrôle · pression",
    resume: "Footballeur et général d'opérette : ballon qui rebondit, porte-voix qui intimide, décrets qui font taire.",
    couleur: 0x6f9bff,
  },
  theodore: {
    role: "Assassin · mobilité",
    resume: "Délégué en costume, urbexeur, cinéaste. Triple saut, pièges et passe-muraille, mais peu de PV.",
    couleur: 0xe8c872,
  },
};

function css(couleur: number): string {
  return `#${couleur.toString(16).padStart(6, "0")}`;
}

export function catalogue(): { persos: FichePerso[]; cartes: FicheCarte[] } {
  return {
    persos: PERSOS.map((p) => {
      const presentation = PRESENTATIONS[p.id];
      return {
        id: p.id,
        nom: p.nom,
        role: presentation?.role ?? "",
        resume: presentation?.resume ?? "",
        couleur: css(presentation?.couleur ?? 0xf6f1e7),
      };
    }),
    cartes: CARTES.map((c) => ({ id: c.id, nom: c.nom })),
  };
}
