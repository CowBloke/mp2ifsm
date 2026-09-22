import type { Carte } from "./carte";
import { deplacementX, deplacementY, type Boite } from "./collisions";
import { DASH, DROITE, GAUCHE, SAUT, type Entree } from "./entrees";

/*
 * Un combattant : déplacement, sauts et dash. Pas encore de combat.
 *
 * `avancerCombattant` ne dépend que du combattant, de son entrée et de
 * la carte. C'est ce qui permettra au client de prédire son propre
 * déplacement en rejouant exactement le calcul du serveur.
 */

/** Caractéristiques de déplacement, en unités (cf. constantes.ts) et en ticks. */
export type StatsCombattant = {
  largeur: number;
  hauteur: number;
  vitesseSol: number;
  accelerationSol: number;
  freinageSol: number;
  vitesseAir: number;
  accelerationAir: number;
  freinageAir: number;
  gravite: number;
  vitesseChuteMax: number;
  impulsionSaut: number;
  impulsionDoubleSaut: number;
  /** Sauts permis en l'air avant de retoucher le sol (1 = double saut). */
  sautsAeriens: number;
  dashVitesse: number;
  /** Durée d'un dash, en ticks. */
  dashDuree: number;
  /** Attente entre la fin d'un dash et le suivant, en ticks. */
  dashRecharge: number;
  /** Dashs permis en l'air avant de retoucher le sol. */
  dashsAeriens: number;
};

export type Combattant = {
  stats: StatsCombattant;
  /** Milieu des pieds ; y croît vers le bas. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  orientation: 1 | -1;
  auSol: boolean;
  sautsRestants: number;
  dashsRestants: number;
  /** Ticks de dash restants, 0 hors dash. */
  dash: number;
  /** Ticks avant de pouvoir dasher de nouveau. */
  recharge: number;
  entreePrecedente: Entree;
};

export function creerCombattant(stats: StatsCombattant, x: number, y: number): Combattant {
  return {
    stats, x, y, vx: 0, vy: 0, orientation: 1, auSol: false,
    sautsRestants: stats.sautsAeriens, dashsRestants: stats.dashsAeriens,
    dash: 0, recharge: 0, entreePrecedente: 0,
  };
}

export function boiteDe(c: Combattant): Boite {
  const gauche = c.x - Math.floor(c.stats.largeur / 2);
  return { gauche, haut: c.y - c.stats.hauteur, droite: gauche + c.stats.largeur, bas: c.y };
}

function tendreVers(v: number, cible: number, pas: number): number {
  return v < cible ? Math.min(v + pas, cible) : Math.max(v - pas, cible);
}

/** Avance le combattant d'un tick. Modifie `c` en place. */
export function avancerCombattant(c: Combattant, entree: Entree, carte: Carte): void {
  const s = c.stats;
  // Seuls les appuis comptent pour sauter ou dasher : tenir la touche
  // ne relance rien.
  const appui = entree & ~c.entreePrecedente;
  c.entreePrecedente = entree;
  const direction = (entree & DROITE ? 1 : 0) - (entree & GAUCHE ? 1 : 0);

  if (c.recharge > 0) c.recharge--;

  // Dash : vitesse horizontale fixe, gravité suspendue. Sans direction
  // tenue, il part du côté où regarde le combattant.
  if (appui & DASH && c.dash === 0 && c.recharge === 0 && (c.auSol || c.dashsRestants > 0)) {
    if (!c.auSol) c.dashsRestants--;
    if (direction !== 0) c.orientation = direction > 0 ? 1 : -1;
    c.dash = s.dashDuree;
  }

  // Saut depuis le sol, sinon saut aérien. Sauter interrompt le dash.
  if (appui & SAUT && (c.auSol || c.sautsRestants > 0)) {
    if (c.auSol) {
      c.vy = -s.impulsionSaut;
    } else {
      c.sautsRestants--;
      c.vy = -s.impulsionDoubleSaut;
    }
    if (c.dash > 0) {
      c.dash = 0;
      c.recharge = s.dashRecharge;
    }
  }

  if (c.dash > 0) {
    c.vx = c.orientation * s.dashVitesse;
    c.vy = 0;
    if (--c.dash === 0) c.recharge = s.dashRecharge;
  } else {
    const cible = direction * (c.auSol ? s.vitesseSol : s.vitesseAir);
    const pas = direction === 0
      ? (c.auSol ? s.freinageSol : s.freinageAir)
      : (c.auSol ? s.accelerationSol : s.accelerationAir);
    c.vx = tendreVers(c.vx, cible, pas);
    c.vy = Math.min(c.vy + s.gravite, s.vitesseChuteMax);
    if (direction !== 0) c.orientation = direction > 0 ? 1 : -1;
  }

  // Déplacement axe par axe ; un obstacle annule la vitesse sur son axe.
  const b = boiteDe(c);
  const dx = deplacementX(b, c.vx, carte.solides);
  if (dx !== c.vx) c.vx = 0;
  c.x += dx;
  b.gauche += dx;
  b.droite += dx;

  const dy = deplacementY(b, c.vy, carte.solides);
  if (dy !== c.vy) c.vy = 0;
  c.y += dy;
  b.haut += dy;
  b.bas += dy;

  // Au sol : on ne monte pas et un solide touche les pieds.
  c.auSol = c.vy >= 0 && deplacementY(b, 1, carte.solides) === 0;
  if (c.auSol) {
    c.vy = 0;
    c.sautsRestants = s.sautsAeriens;
    c.dashsRestants = s.dashsAeriens;
  }
}
