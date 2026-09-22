import type { Cle, Pose, PosePartielle } from "./types";

/*
 * Opérations sur les poses : compléter, mélanger, échantillonner des
 * images clés. Pur calcul, testable sans navigateur.
 */

export const POSE_NEUTRE: Pose = {
  bassin: [0, 0, 0],
  torse: 0,
  tete: 0,
  brasAv: [0, 0],
  brasAr: [0, 0],
  jambeAv: [0, 0],
  jambeAr: [0, 0],
  rotation: 0,
  echelle: [1, 1],
  decalage: [0, 0],
};

export function copier(p: Pose): Pose {
  return {
    bassin: [...p.bassin], torse: p.torse, tete: p.tete,
    brasAv: [...p.brasAv], brasAr: [...p.brasAr], jambeAv: [...p.jambeAv], jambeAr: [...p.jambeAr],
    rotation: p.rotation, echelle: [...p.echelle], decalage: [...p.decalage],
  };
}

/** `base` dont les champs présents dans `partielle` sont remplacés. */
export function completer(base: Pose, partielle: PosePartielle): Pose {
  const p = copier(base);
  if (partielle.bassin) p.bassin = [...partielle.bassin];
  if (partielle.torse !== undefined) p.torse = partielle.torse;
  if (partielle.tete !== undefined) p.tete = partielle.tete;
  if (partielle.brasAv) p.brasAv = [...partielle.brasAv];
  if (partielle.brasAr) p.brasAr = [...partielle.brasAr];
  if (partielle.jambeAv) p.jambeAv = [...partielle.jambeAv];
  if (partielle.jambeAr) p.jambeAr = [...partielle.jambeAr];
  if (partielle.rotation !== undefined) p.rotation = partielle.rotation;
  if (partielle.echelle) p.echelle = [...partielle.echelle];
  if (partielle.decalage) p.decalage = [...partielle.decalage];
  return p;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Mélange de a vers b (t = 0 → a, t = 1 → b), écrit dans `sortie`. */
export function melanger(a: Pose, b: Pose, t: number, sortie: Pose = copier(a)): Pose {
  for (let i = 0; i < 3; i++) sortie.bassin[i] = lerp(a.bassin[i], b.bassin[i], t);
  sortie.torse = lerp(a.torse, b.torse, t);
  sortie.tete = lerp(a.tete, b.tete, t);
  for (let i = 0; i < 2; i++) {
    sortie.brasAv[i] = lerp(a.brasAv[i], b.brasAv[i], t);
    sortie.brasAr[i] = lerp(a.brasAr[i], b.brasAr[i], t);
    sortie.jambeAv[i] = lerp(a.jambeAv[i], b.jambeAv[i], t);
    sortie.jambeAr[i] = lerp(a.jambeAr[i], b.jambeAr[i], t);
    sortie.echelle[i] = lerp(a.echelle[i], b.echelle[i], t);
    sortie.decalage[i] = lerp(a.decalage[i], b.decalage[i], t);
  }
  sortie.rotation = lerp(a.rotation, b.rotation, t);
  return sortie;
}

/** Démarrage vif, arrivée douce : les coups « claquent » puis se posent. */
function adoucir(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Pose à la frame `f` (fractionnaire) d'une suite d'images clés complétées sur `base`. */
export function echantillonner(cles: readonly Cle[], f: number, base: Pose): Pose {
  if (cles.length === 0) return copier(base);
  if (f <= cles[0].f) return completer(base, cles[0].p);
  for (let i = 1; i < cles.length; i++) {
    const b = cles[i];
    if (f <= b.f) {
      const a = cles[i - 1];
      const t = b.f === a.f ? 1 : (f - a.f) / (b.f - a.f);
      return melanger(completer(base, a.p), completer(base, b.p), adoucir(t));
    }
  }
  return completer(base, cles[cles.length - 1].p);
}
