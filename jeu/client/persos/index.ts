import { APPARENCE_CORBICEPS } from "./corbiceps";
import { APPARENCE_MANNEQUIN } from "./mannequin";
import type { Apparence } from "./types";

/*
 * Registre des apparences, par identifiant de personnage. Un personnage
 * sans apparence dédiée prend celle du mannequin : le jeu reste jouable
 * pendant qu'on le dessine.
 */

const APPARENCES: Readonly<Record<string, Apparence>> = {
  corbiceps: APPARENCE_CORBICEPS,
  mannequin: APPARENCE_MANNEQUIN,
};

export function apparenceDe(id: string): Apparence {
  return APPARENCES[id] ?? APPARENCE_MANNEQUIN;
}
