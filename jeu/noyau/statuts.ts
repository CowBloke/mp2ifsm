import type { Combattant } from "./combattant";

/*
 * Statuts : effets temporaires génériques. Un personnage ne crée pas de
 * mécanique propre dans le moteur, il inflige ou s'applique ces statuts.
 */

export type StatutDef = {
  duree: number;
  /** Multiplicateurs en millièmes. */
  vitesse?: number;
  gravite?: number;
  degatsInfliges?: number;
  degatsRecus?: number;
  /** Ne peut plus agir. */
  etourdi?: boolean;
  /** Ne peut plus utiliser de spéciaux ni d'ultime. */
  silence?: boolean;
  /** Les coups reçus blessent sans interrompre. */
  armure?: boolean;
  /** Disparaît au premier coup reçu. */
  unique?: boolean;
};

export const STATUTS: Readonly<Record<string, StatutDef>> = {
  ralenti: { duree: 180, vitesse: 600 },
  etourdi: { duree: 45, etourdi: true },
  silence: { duree: 150, silence: true },
  intimide: { duree: 240, degatsInfliges: 700 },
  galvanise: { duree: 360, degatsInfliges: 1250, vitesse: 1200 },
  marque: { duree: 300, degatsRecus: 1500, unique: true },
  armure: { duree: 120, armure: true },
  apesanteur: { duree: 150, gravite: 450 },
};

type Multiplicateur = "vitesse" | "gravite" | "degatsInfliges" | "degatsRecus";
type Drapeau = "etourdi" | "silence" | "armure";

export function appliquerStatut(c: Combattant, id: string): void {
  const def = STATUTS[id];
  if (!def) throw new Error(`statut inconnu : ${id}`);
  const actif = c.statuts.find((s) => s.id === id);
  if (actif) actif.ticks = Math.max(actif.ticks, def.duree);
  else c.statuts.push({ id, ticks: def.duree });
}

/** Produit des multiplicateurs actifs, en millièmes. */
export function multiplicateur(c: Combattant, champ: Multiplicateur): number {
  let m = 1000;
  for (const s of c.statuts) {
    const v = STATUTS[s.id][champ];
    if (v !== undefined) m = Math.trunc((m * v) / 1000);
  }
  return m;
}

export function aStatut(c: Combattant, drapeau: Drapeau): boolean {
  return c.statuts.some((s) => STATUTS[s.id][drapeau] === true);
}

/** Retire les statuts qui ne valent que pour un coup reçu. */
export function consommerUniques(c: Combattant): void {
  c.statuts = c.statuts.filter((s) => !STATUTS[s.id].unique);
}
