import { APPARENCE_CORBICEPS } from "./corbiceps";
import { APPARENCE_MANNEQUIN } from "./mannequin";
import { APPARENCE_PRICOU } from "./pricou";
import { APPARENCE_SOUHEIL } from "./souheil";
import { APPARENCE_THEODORE } from "./theodore";
import type { Apparence } from "./types";

/*
 * Registre des apparences, par identifiant de personnage. Un personnage
 * sans apparence dédiée prend celle du mannequin : le jeu reste jouable
 * pendant qu'on le dessine.
 */

const APPARENCES: Readonly<Record<string, Apparence>> = {
  corbiceps: APPARENCE_CORBICEPS,
  mannequin: APPARENCE_MANNEQUIN,
  pricou: APPARENCE_PRICOU,
  souheil: APPARENCE_SOUHEIL,
  theodore: APPARENCE_THEODORE,
};

export function apparenceDe(id: string): Apparence {
  return APPARENCES[id] ?? APPARENCE_MANNEQUIN;
}
