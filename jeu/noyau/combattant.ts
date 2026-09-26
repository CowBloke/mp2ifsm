import type { Carte } from "./carte";
import { deplacementX, deplacementY, type Boite } from "./collisions";
import { choisirCoup, coupDe, dans, demarrerCoup, finirCoup, mouvementA } from "./coups";
import type { PersoDef } from "./definitions";
import { ACTIONS, ATTAQUE, BAS, DASH, SAUT, directionX, type Entree } from "./entrees";
import { emettre } from "./evenements";
import type { Monde } from "./monde";
import { aStatut, multiplicateur } from "./statuts";

/*
 * Un combattant : état complet et pas de simulation individuel.
 *
 * `avancerCombattant` ne lit que le combattant, son entrée et la carte :
 * c'est ce qui permettra au client de prédire son propre personnage en
 * rejouant exactement le calcul du serveur. Les interactions entre
 * combattants (coups reçus) sont résolues à part, cf. combat.ts.
 */

/** Ticks pendant lesquels un appui reste en mémoire s'il ne peut pas encore servir. */
export const TAMPON = 8;
/** Ticks pendant lesquels les plateformes sont ignorées après « bas ». */
const TRAVERSEE = 10;

export type Combattant = {
  /** Place dans la partie (0 à 3). */
  id: number;
  perso: PersoDef;
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
  rechargeDash: number;
  pv: number;
  /** Jauge d'ultime, de 0 à JAUGE_MAX. */
  jauge: number;
  /** Coup en cours (identifiant), frame jouée, numéro d'exécution. */
  coup: string | null;
  frame: number;
  instance: number;
  /** Ticks de charge accumulés et bouton qui la maintient. */
  charge: number;
  bouton: Entree;
  /** Coup à enchaîner à la fin du tick (touche réussie, riposte). */
  enchainer: string | null;
  /** Cibles déjà touchées par ce coup : groupe × 16 + place. */
  touches: number[];
  hitstun: number;
  /** Gel d'impact (hitlag) : plus rien n'avance. */
  gel: number;
  /** Récupération d'atterrissage : immobile mais vulnérable. */
  lag: number;
  invulnerable: number;
  traversee: number;
  recharges: { coup: string; ticks: number }[];
  statuts: { id: string; ticks: number }[];
  /** Coups « une fois par saut » déjà utilisés depuis le dernier atterrissage. */
  aeriensUtilises: string[];
  entreePrecedente: Entree;
  /** Appuis d'action pas encore servis, et leur âge. */
  tampon: Entree;
  tamponAge: number;
  ko: boolean;
  /** Sorti de l'arène pour de bon pendant cette manche. */
  horsJeu: boolean;
  victoires: number;
  degatsInfliges: number;
};

export function creerCombattant(perso: PersoDef, id: number, x: number, y: number): Combattant {
  const s = perso.stats;
  return {
    id, perso, x, y, vx: 0, vy: 0, orientation: 1, auSol: false,
    sautsRestants: s.sautsAeriens, dashsRestants: s.dashsAeriens, dash: 0, rechargeDash: 0,
    pv: s.pv, jauge: 0,
    coup: null, frame: 0, instance: 0, charge: 0, bouton: 0, enchainer: null, touches: [],
    hitstun: 0, gel: 0, lag: 0, invulnerable: 0, traversee: 0,
    recharges: [], statuts: [], aeriensUtilises: [],
    entreePrecedente: 0, tampon: 0, tamponAge: 0,
    ko: false, horsJeu: false, victoires: 0, degatsInfliges: 0,
  };
}

/** État de départ de manche, pieds en (x, y). Victoires, dégâts cumulés et jauge sont conservés. */
export function replacer(c: Combattant, x: number, y: number, orientation: 1 | -1): void {
  const s = c.perso.stats;
  Object.assign(c, {
    x, y, vx: 0, vy: 0, orientation, auSol: false,
    sautsRestants: s.sautsAeriens, dashsRestants: s.dashsAeriens, dash: 0, rechargeDash: 0,
    pv: s.pv, hitstun: 0, gel: 0, lag: 0, invulnerable: 0, traversee: 0,
    recharges: [], statuts: [], aeriensUtilises: [], tampon: 0, tamponAge: 0,
    ko: false, horsJeu: false,
  });
  finirCoup(c);
}

export function boiteDe(c: Combattant): Boite {
  const gauche = c.x - Math.floor(c.perso.stats.largeur / 2);
  return { gauche, haut: c.y - c.perso.stats.hauteur, droite: gauche + c.perso.stats.largeur, bas: c.y };
}

export function peutAgir(c: Combattant, monde: Monde): boolean {
  return monde.phase === "combat" && !c.ko && c.hitstun === 0 && c.lag === 0 && !aStatut(c, "etourdi");
}

function tendreVers(v: number, cible: number, pas: number): number {
  return v < cible ? Math.min(v + pas, cible) : Math.max(v - pas, cible);
}

function echelle(v: number, milliemes: number): number {
  return Math.trunc((v * milliemes) / 1000);
}

/** Commandes et physique d'un tick. Modifie `c` en place. */
export function avancerCombattant(c: Combattant, entree: Entree, monde: Monde): void {
  if (c.horsJeu) return;

  // Un appui d'action qui ne peut pas servir tout de suite (fin de coup,
  // gel d'impact…) reste en mémoire quelques ticks.
  const appui = entree & ~c.entreePrecedente;
  c.entreePrecedente = entree;
  if (appui & ACTIONS) {
    c.tampon |= appui & ACTIONS;
    c.tamponAge = 0;
  } else if (c.tampon !== 0 && ++c.tamponAge > TAMPON) {
    c.tampon = 0;
  }

  if (c.gel > 0) return;
  decompter(c);

  const direction = directionX(entree);
  const libre = peutAgir(c, monde);
  if (libre) {
    const coup = coupDe(c);
    if (coup?.suite && c.tampon & ATTAQUE && dans(c.frame, coup.suite.de, coup.suite.a)) {
      c.tampon &= ~ATTAQUE;
      demarrerCoup(c, coup.suite.coup, monde);
    } else if (!coup || (coup.annulable !== undefined && c.frame >= coup.annulable)) {
      agir(c, entree, direction, monde);
    }
  }
  deplacer(c, appui, direction, libre, monde);
}

function decompter(c: Combattant): void {
  if (c.rechargeDash > 0) c.rechargeDash--;
  if (c.invulnerable > 0) c.invulnerable--;
  if (c.traversee > 0) c.traversee--;
  if (c.lag > 0) c.lag--;
  if (c.hitstun > 0) c.hitstun--;
  if (c.recharges.length > 0) {
    for (const r of c.recharges) r.ticks--;
    c.recharges = c.recharges.filter((r) => r.ticks > 0);
  }
  if (c.statuts.length > 0) {
    for (const s of c.statuts) s.ticks--;
    c.statuts = c.statuts.filter((s) => s.ticks > 0);
  }
}

/** Saut, coup ou dash. Le saut passe d'abord : une attaque tamponnée partira en l'air au tick suivant. */
function agir(c: Combattant, entree: Entree, direction: -1 | 0 | 1, monde: Monde): void {
  const s = c.perso.stats;

  if (c.tampon & SAUT && (c.auSol || c.sautsRestants > 0)) {
    c.tampon &= ~SAUT;
    if (c.coup !== null) finirCoup(c);
    if (c.dash > 0) {
      c.dash = 0;
      c.rechargeDash = s.dashRecharge;
    }
    if (c.auSol) {
      c.vy = -s.impulsionSaut;
    } else {
      c.sautsRestants--;
      c.vy = -s.impulsionDoubleSaut;
      // Le double saut permet de changer de direction.
      if (direction !== 0) c.vx = direction * echelle(s.vitesseAir, multiplicateur(c, "vitesse"));
    }
    emettre(monde, { type: "saut", source: c.id, x: c.x, y: c.y, valeur: c.auSol ? 0 : 1 });
    return;
  }

  const id = choisirCoup(c, entree, direction);
  if (id !== null) {
    demarrerCoup(c, id, monde);
    return;
  }

  // Dash : vitesse horizontale fixe, gravité suspendue, début invulnérable.
  // Sans direction tenue, il part du côté où regarde le combattant.
  if (c.tampon & DASH && c.dash === 0 && c.rechargeDash === 0 && (c.auSol || c.dashsRestants > 0)) {
    c.tampon &= ~DASH;
    if (!c.auSol) c.dashsRestants--;
    if (direction !== 0) c.orientation = direction;
    c.dash = s.dashDuree;
    c.invulnerable = Math.max(c.invulnerable, s.dashInvulnerable);
    emettre(monde, { type: "dash", source: c.id, x: c.x, y: c.y, valeur: c.orientation });
  }
}

function deplacer(c: Combattant, appui: Entree, direction: -1 | 0 | 1, libre: boolean, monde: Monde): void {
  const s = c.perso.stats;
  const carte = monde.carte;
  const coup = coupDe(c);
  const vitesse = multiplicateur(c, "vitesse");
  let gravite = echelle(s.gravite, multiplicateur(c, "gravite"));

  if (c.dash > 0) {
    c.vx = c.orientation * echelle(s.dashVitesse, vitesse);
    c.vy = 0;
    gravite = 0;
    if (--c.dash === 0) c.rechargeDash = s.dashRecharge;
  } else if (coup) {
    const m = mouvementA(coup, c.frame);
    if (m?.vx !== undefined) c.vx = c.orientation * m.vx;
    else if (c.auSol) c.vx = tendreVers(c.vx, 0, s.freinageSol);
    else c.vx = tendreVers(c.vx, direction * echelle(s.vitesseAir, vitesse), echelle(s.accelerationAir, coup.controleAir ?? 500));
    if (m?.vy !== undefined) c.vy = m.vy;
    if (m?.gravite !== undefined) gravite = echelle(gravite, m.gravite);
  } else if (libre) {
    const cible = direction * echelle(c.auSol ? s.vitesseSol : s.vitesseAir, vitesse);
    const pas = direction === 0
      ? (c.auSol ? s.freinageSol : s.freinageAir)
      : (c.auSol ? s.accelerationSol : s.accelerationAir);
    c.vx = tendreVers(c.vx, cible, pas);
    if (direction !== 0) c.orientation = direction;
    // Bas : traverser la plateforme sous ses pieds, ou chuter plus vite.
    if (appui & BAS) {
      if (c.auSol && surPlateforme(c, carte)) c.traversee = TRAVERSEE;
      else if (!c.auSol && c.vy > 0) c.vy = Math.max(c.vy, s.vitesseChuteRapide);
    }
  } else {
    // Projeté, étourdi, à terre : plus de contrôle, on glisse.
    const freinage = c.auSol ? (c.hitstun > 0 ? s.freinageSol >> 1 : s.freinageSol) : s.freinageAir;
    c.vx = tendreVers(c.vx, 0, freinage);
  }

  // Une vitesse de chute déjà supérieure au plafond (chute rapide, coup
  // vers le bas) est conservée ; sinon la gravité l'y amène.
  if (c.vy < s.vitesseChuteMax) c.vy = Math.min(c.vy + gravite, s.vitesseChuteMax);

  // Déplacement axe par axe ; un obstacle annule la vitesse sur son axe.
  const plateformes = c.traversee > 0 ? [] : carte.plateformes;
  const b = boiteDe(c);
  const dx = deplacementX(b, c.vx, carte.solides);
  if (dx !== c.vx) c.vx = 0;
  c.x += dx;
  b.gauche += dx;
  b.droite += dx;

  const vitesseChute = c.vy;
  const dy = deplacementY(b, c.vy, carte.solides, plateformes);
  if (dy !== c.vy) c.vy = 0;
  c.y += dy;
  b.haut += dy;
  b.bas += dy;

  // Au sol : on ne monte pas et un solide (ou une plateforme) touche les pieds.
  const etaitAuSol = c.auSol;
  c.auSol = c.vy >= 0 && deplacementY(b, 1, carte.solides, plateformes) === 0;
  if (c.auSol) {
    c.vy = 0;
    c.sautsRestants = s.sautsAeriens;
    c.dashsRestants = s.dashsAeriens;
    if (c.aeriensUtilises.length > 0) c.aeriensUtilises = [];
    if (!etaitAuSol) {
      const aerien = coupDe(c);
      if (aerien?.atterrissage !== undefined) {
        finirCoup(c);
        c.lag = aerien.atterrissage;
      }
      emettre(monde, { type: "atterrissage", source: c.id, x: c.x, y: c.y, valeur: vitesseChute });
    }
  }
}

/** Debout sur une plateforme traversable (et non sur un bloc plein). */
export function surPlateforme(c: Combattant, carte: Carte): boolean {
  return c.auSol && deplacementY(boiteDe(c), 1, carte.solides) !== 0;
}
