import type { Carte } from "../carte";
import type { PersoDef } from "../definitions";
import { SALLE_ENTRAINEMENT } from "./cartes/salle-entrainement";
import { MANNEQUIN } from "./persos/mannequin";

/*
 * Registres du contenu. Le réseau ne transporte que des identifiants ;
 * chaque côté retrouve ici les définitions complètes.
 */

export const PERSOS: readonly PersoDef[] = [MANNEQUIN];
export const CARTES: readonly Carte[] = [SALLE_ENTRAINEMENT];

export function persoParId(id: string): PersoDef {
  const p = PERSOS.find((p) => p.id === id);
  if (!p) throw new Error(`personnage inconnu : ${id}`);
  return p;
}

export function carteParId(id: string): Carte {
  const c = CARTES.find((c) => c.id === id);
  if (!c) throw new Error(`carte inconnue : ${id}`);
  return c;
}
