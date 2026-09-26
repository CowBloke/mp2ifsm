import type { Carte } from "../noyau/carte";
import type { CoupDef, HitboxDef, PersoDef, StatsCombattant } from "../noyau/definitions";
import type { Entree } from "../noyau/entrees";
import { avancerMonde, creerMonde, type Monde } from "../noyau/monde";
import { REGLAGES_STANDARD, type Reglages } from "../noyau/regles";

/*
 * Accessoires des tests : un personnage et une carte aux valeurs rondes,
 * indépendants du contenu du jeu — régler la sensation de jeu ne doit
 * pas casser les tests du moteur.
 */

export const STATS: StatsCombattant = {
  pv: 1000, poids: 100, largeur: 4000, hauteur: 8000,
  vitesseSol: 800, accelerationSol: 200, freinageSol: 200,
  vitesseAir: 600, accelerationAir: 100, freinageAir: 50,
  gravite: 100, vitesseChuteMax: 2000, vitesseChuteRapide: 3000,
  impulsionSaut: 2000, impulsionDoubleSaut: 1500, sautsAeriens: 1,
  dashVitesse: 3000, dashDuree: 10, dashRecharge: 20, dashsAeriens: 1, dashInvulnerable: 0,
};

/** Sommet du sol. */
export const SOL = 100_000;
export const LOIN = 10_000_000;

export function carte(options: Partial<Carte> = {}): Carte {
  return {
    id: "test",
    nom: "Test",
    limites: { gauche: -LOIN, haut: -LOIN, droite: LOIN, bas: LOIN },
    zoneVie: { gauche: -LOIN, haut: -LOIN, droite: LOIN, bas: LOIN },
    solides: [{ gauche: -LOIN, haut: SOL, droite: LOIN, bas: LOIN }],
    plateformes: [],
    apparitions: [{ x: 0, y: SOL }, { x: 8000, y: SOL }, { x: -8000, y: SOL }, { x: 16_000, y: SOL }],
    ...options,
  };
}

/** Sans décompte ni chrono : on agit dès le premier tick. */
export const LIBRE: Reglages = { ...REGLAGES_STANDARD, dureeDecompte: 0, dureeManche: 0 };

export function perso(coups: Record<string, CoupDef> = {}, stats: Partial<StatsCombattant> = {}): PersoDef {
  return { id: "test", nom: "Test", stats: { ...STATS, ...stats }, coups };
}

/** Frappe de test : devant le combattant, à mi-hauteur, assez large pour toucher un voisin à 8000. */
export function frappeTest(h: Partial<HitboxDef> = {}): HitboxDef {
  return { de: 5, a: 7, x: 5000, y: 4000, l: 6000, h: 4000, degats: 100, recul: 1000, angle: 0, hitstun: 20, gel: 5, ...h };
}

export function monde(persos: PersoDef[], options: { carte?: Carte; reglages?: Reglages } = {}): Monde {
  return creerMonde(options.carte ?? carte(), persos, options.reglages ?? LIBRE);
}

/** Joue `ticks` ticks avec les mêmes entrées (une par combattant). */
export function jouer(m: Monde, entrees: Entree | readonly Entree[] = [], ticks = 1): void {
  const tab = typeof entrees === "number" ? [entrees] : entrees;
  for (let i = 0; i < ticks; i++) avancerMonde(m, tab);
}

/** Entrées pseudo-aléatoires tenues quelques ticks, comme un vrai joueur. */
export function entreesAleatoires(graine: number, n: number, masque: number): Entree[] {
  let x = graine;
  const suivant = () => (x = (Math.imul(x, 1103515245) + 12345) >>> 0);
  const entrees: Entree[] = [];
  while (entrees.length < n) {
    const e = (suivant() >>> 8) & masque;
    for (let k = 1 + (suivant() % 12); k > 0; k--) entrees.push(e);
  }
  return entrees.slice(0, n);
}

/** Vérifie récursivement que toutes les valeurs numériques de l'état sont des entiers sûrs. */
export function valeursEntieres(objet: unknown, chemin = "état"): string | null {
  if (typeof objet === "number") return Number.isSafeInteger(objet) ? null : chemin;
  if (Array.isArray(objet)) {
    for (let i = 0; i < objet.length; i++) {
      const e = valeursEntieres(objet[i], `${chemin}[${i}]`);
      if (e) return e;
    }
  } else if (objet && typeof objet === "object") {
    for (const [cle, v] of Object.entries(objet)) {
      if (cle === "perso" || cle === "carte" || cle === "reglages") continue;
      const e = valeursEntieres(v, `${chemin}.${cle}`);
      if (e) return e;
    }
  }
  return null;
}
