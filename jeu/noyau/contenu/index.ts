import type { Carte } from "../carte";
import type { PersoDef } from "../definitions";
import { LABO } from "./cartes/labo";
import { SALLE_ENTRAINEMENT } from "./cartes/salle-entrainement";
import { TOIT } from "./cartes/toit";
import { CORBICEPS } from "./persos/corbiceps";
import { MANNEQUIN } from "./persos/mannequin";
import { PRICOU } from "./persos/pricou";
import { SOUHEIL } from "./persos/souheil";
import { THEODORE } from "./persos/theodore";

/*
 * Registres du contenu. Le réseau ne transporte que des identifiants ;
 * chaque côté retrouve ici les définitions complètes.
 */

/** Personnages jouables, dans l'ordre de l'écran de sélection. */
export const PERSOS: readonly PersoDef[] = [CORBICEPS, PRICOU, SOUHEIL, THEODORE];
/** Cible d'entraînement : jamais proposée à la sélection. */
export const PERSOS_ENTRAINEMENT: readonly PersoDef[] = [MANNEQUIN];

export const TOUS_LES_PERSOS: readonly PersoDef[] = [...PERSOS, ...PERSOS_ENTRAINEMENT];
export const CARTES: readonly Carte[] = [SALLE_ENTRAINEMENT, LABO, TOIT];

export function persoParId(id: string): PersoDef {
  const p = TOUS_LES_PERSOS.find((p) => p.id === id);
  if (!p) throw new Error(`personnage inconnu : ${id}`);
  return p;
}

export function carteParId(id: string): Carte {
  const c = CARTES.find((c) => c.id === id);
  if (!c) throw new Error(`carte inconnue : ${id}`);
  return c;
}
