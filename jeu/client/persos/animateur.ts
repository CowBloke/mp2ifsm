import type { Combattant } from "../../noyau/combattant";
import { SOUS_PIXELS } from "../../noyau/constantes";
import { coupDe } from "../../noyau/coups";
import type { CoupDef } from "../../noyau/definitions";
import type { Monde } from "../../noyau/monde";
import { POSE_NEUTRE, completer, copier, echantillonner, melanger } from "./pose";
import type { Apparence, Cle, Pose, PosePartielle } from "./types";

/*
 * Choix de la pose d'un combattant à chaque image, d'après son état de
 * simulation (lu, jamais modifié), puis lissage vers cette pose.
 */

const DEG = 180 / Math.PI;
const DUREE_SALTO = 320;

export type EtatAnimation = {
  /** Pose affichée, lissée. */
  pose: Pose;
  phaseCourse: number;
  xPrecedent: number | null;
  /** ms restantes du salto de double saut. */
  salto: number;
  sautsAvant: number;
  /** Rotation accumulée d'un combattant projeté. */
  vrille: number;
  temps: number;
  /** Animations de repli déjà calculées, par coup. */
  generiques: Map<string, readonly Cle[]>;
};

export function creerEtatAnimation(ap: Apparence): EtatAnimation {
  return {
    pose: completer(POSE_NEUTRE, ap.poses.garde),
    phaseCourse: 0,
    xPrecedent: null,
    salto: 0,
    sautsAvant: 0,
    vrille: 0,
    temps: 0,
    generiques: new Map(),
  };
}

/**
 * Animation de repli d'un coup sans animation dédiée : le bras (ou la
 * jambe, pour une hitbox basse) vise la première hitbox pendant ses
 * frames actives, après un bref armé.
 */
function animationGenerique(ap: Apparence, coup: CoupDef): readonly Cle[] {
  const hb = coup.hitboxes?.[0];
  if (!hb) return [{ f: 0, p: {} }];
  const P = ap.proportions;
  const x = hb.x / SOUS_PIXELS;
  const y = hb.y / SOUS_PIXELS;
  let vise: PosePartielle;
  let arme: PosePartielle;
  if (y < P.hanche * 0.6) {
    const angle = Math.atan2(x - P.hancheAv, P.hanche - y) * DEG;
    vise = { jambeAv: [angle, 0], torse: -8 };
    arme = { jambeAv: [angle - 60, -70], torse: 4 };
  } else {
    const angle = Math.atan2(x - P.epauleAv[0], P.hanche + P.epauleAv[1] - y) * DEG;
    vise = { brasAv: [angle, 0], torse: 14 };
    arme = { brasAv: [angle - 70, 110], torse: -4 };
  }
  return [
    { f: 0, p: {} },
    { f: Math.max(1, hb.de - 3), p: arme },
    { f: hb.de, p: vise },
    { f: hb.a + 1, p: vise },
    { f: Math.min(coup.duree, hb.a + 9), p: {} },
  ];
}

function course(ap: Apparence, garde: Pose, c: Combattant, e: EtatAnimation, x: number): Pose {
  const P = ap.proportions;
  const foulee = (P.jambe[0] + P.jambe[1]) * 1.6;
  if (e.xPrecedent !== null) e.phaseCourse += (Math.abs(x - e.xPrecedent) / foulee) * Math.PI;
  const phi = e.phaseCourse;
  const k = Math.min(1, Math.abs(c.vx) / c.perso.stats.vitesseSol);
  const s = Math.sin(phi);
  const p = copier(garde);
  p.jambeAv = [5 + 40 * s * k, -18 - 60 * Math.max(0, Math.cos(phi)) * k];
  p.jambeAr = [5 - 40 * s * k, -18 - 60 * Math.max(0, -Math.cos(phi)) * k];
  p.brasAv = [garde.brasAv[0] - 30 * s * k, garde.brasAv[1]];
  p.brasAr = [garde.brasAr[0] + 30 * s * k, garde.brasAr[1]];
  p.torse = garde.torse + 10 * k;
  p.bassin = [garde.bassin[0], garde.bassin[1] - 4 * Math.abs(Math.cos(phi)) * k, 0];
  return p;
}

/**
 * Pose de l'image. `x` : position affichée (px), `alpha` : avancement
 * dans le tick courant, pour des coups fluides entre deux frames.
 */
export function animer(ap: Apparence, c: Combattant, monde: Monde, e: EtatAnimation,
  x: number, alpha: number, dtMs: number): Pose {
  e.temps += dtMs;
  const garde = completer(POSE_NEUTRE, ap.poses.garde);
  let cible: Pose;
  let vif = false;

  // Un saut aérien consommé en l'air : salto avant.
  if (!c.auSol && c.sautsRestants < e.sautsAvant) e.salto = DUREE_SALTO;
  e.sautsAvant = c.sautsRestants;
  e.salto = Math.max(0, e.salto - dtMs);

  const vitesse = Math.hypot(c.vx, c.vy);
  const gagnant = (monde.phase === "finPartie" && monde.vainqueur === c.id)
    || (monde.phase === "finManche" && monde.vainqueurManche === c.id && monde.phaseTicks > 50);

  if (c.ko) {
    cible = completer(garde, c.auSol ? ap.poses.ko : ap.poses.touche);
    if (!c.auSol) {
      e.vrille += dtMs * 0.8;
      cible.rotation = -e.vrille;
    }
  } else if (c.hitstun > 0) {
    cible = completer(garde, ap.poses.touche);
    // Gros coup : le combattant tournoie tant qu'il vole.
    if (!c.auSol && vitesse > 1500 && c.hitstun > 10) {
      e.vrille += (dtMs * vitesse) / 4500;
      cible.rotation = -e.vrille;
    } else {
      e.vrille = 0;
    }
  } else if (c.coup !== null) {
    const coup = coupDe(c)!;
    let cles = ap.animations[c.coup];
    if (!cles) {
      cles = e.generiques.get(c.coup) ?? animationGenerique(ap, coup);
      e.generiques.set(c.coup, cles);
    }
    const enCharge = coup.charge !== undefined && c.frame === coup.charge.frame && c.charge > 0;
    cible = echantillonner(cles, c.frame + (c.gel > 0 || enCharge ? 0 : alpha), garde);
    if (enCharge) {
      // Charge : le personnage tremble de plus en plus.
      const t = (c.charge / coup.charge!.max) * 3;
      cible.bassin[0] += (Math.random() - 0.5) * t;
      cible.torse += (Math.random() - 0.5) * t;
    }
    vif = true;
    e.vrille = 0;
  } else if (c.dash > 0) {
    cible = completer(garde, ap.poses.dash);
    vif = true;
  } else if (c.lag > 0) {
    cible = completer(garde, ap.poses.atterrissage);
    vif = true;
  } else if (!c.auSol) {
    cible = completer(garde, c.vy < 0 ? ap.poses.saut : ap.poses.chute);
    if (e.salto > 0) cible.rotation = 360 * (1 - e.salto / DUREE_SALTO);
  } else if (gagnant) {
    cible = completer(garde, ap.poses.victoire);
  } else if (Math.abs(c.vx) > 80) {
    cible = course(ap, garde, c, e, x);
  } else {
    // Au repos : respiration.
    cible = copier(garde);
    const r = Math.sin(e.temps / 420);
    cible.torse += 1.5 * r;
    cible.bassin[1] += 1.5 * r;
    cible.brasAv[1] += 3 * r;
  }
  e.xPrecedent = x;

  const k = 1 - Math.exp(-dtMs / (vif ? 26 : 70));
  const rotation = cible.rotation;
  melanger(e.pose, cible, k, e.pose);
  // Saltos et vrilles ne se lissent pas : 360° et 0° sont la même image.
  e.pose.rotation = rotation;
  return e.pose;
}
