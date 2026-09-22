import type { Combattant } from "./combattant";
import type { Boite } from "./collisions";
import type { CoupDef, Emplacement, HitboxDef } from "./definitions";
import { ATTAQUE, BAS, HAUT, SPECIAL, ULTIME, type Entree } from "./entrees";
import { emettre } from "./evenements";
import type { Monde } from "./monde";
import { aStatut, appliquerStatut } from "./statuts";

/*
 * Exécution des coups : choix selon le bouton et la direction, frames,
 * charge, enchaînements. Tout vient des données du personnage.
 */

export const JAUGE_MAX = 1000;

/** Un emplacement vide retombe sur un plus général (« air_bas » → « air_neutre »). */
const REPLIS: Partial<Record<Emplacement, Emplacement>> = {
  air_cote: "air_neutre",
  air_haut: "air_neutre",
  air_bas: "air_neutre",
  special_cote: "special_neutre",
  special_haut: "special_neutre",
  special_bas: "special_neutre",
};

export function dans(frame: number, de: number, a: number): boolean {
  return frame >= de && frame <= a;
}

export function coupDe(c: Combattant): CoupDef | undefined {
  return c.coup === null ? undefined : c.perso.coups[c.coup];
}

function resoudre(c: Combattant, e: Emplacement): string | null {
  let id: Emplacement | undefined = e;
  while (id !== undefined && !c.perso.coups[id]) id = REPLIS[id];
  return id ?? null;
}

function disponible(c: Combattant, id: string): boolean {
  const coup = c.perso.coups[id];
  if (coup.recharge && c.recharges.some((r) => r.coup === id)) return false;
  if (coup.jauge && c.jauge < coup.jauge) return false;
  if (coup.unParSaut && !c.auSol && c.aeriensUtilises.includes(id)) return false;
  return true;
}

function tourner(c: Combattant, direction: -1 | 0 | 1): void {
  if (direction !== 0) c.orientation = direction;
}

/** Coup demandé par les appuis en mémoire, ou null. Consomme l'appui utilisé. */
export function choisirCoup(c: Combattant, entree: Entree, direction: -1 | 0 | 1): string | null {
  const silence = aStatut(c, "silence");
  const air = !c.auSol;

  if (c.tampon & ULTIME) {
    c.tampon &= ~ULTIME; // un ultime refusé n'est pas gardé en mémoire
    if (!silence && c.perso.coups.ultime && disponible(c, "ultime")) return "ultime";
  }
  if (c.tampon & SPECIAL && !silence) {
    const e: Emplacement = entree & HAUT ? "special_haut"
      : entree & BAS ? "special_bas"
      : direction !== 0 ? "special_cote" : "special_neutre";
    const id = resoudre(c, e);
    if (id !== null && disponible(c, id)) {
      c.tampon &= ~SPECIAL;
      tourner(c, direction);
      return id;
    }
  }
  if (c.tampon & ATTAQUE) {
    const e: Emplacement = entree & HAUT ? (air ? "air_haut" : "haut")
      : entree & BAS ? (air ? "air_bas" : "bas")
      : direction !== 0 ? (air ? "air_cote" : "cote")
      : air ? "air_neutre" : "neutre";
    const id = resoudre(c, e);
    if (id !== null && disponible(c, id)) {
      c.tampon &= ~ATTAQUE;
      tourner(c, direction);
      return id;
    }
  }
  return null;
}

/** Bouton dont le maintien charge le coup. */
function boutonDe(id: string): Entree {
  return id === "ultime" ? ULTIME : id.startsWith("special") ? SPECIAL : ATTAQUE;
}

export function demarrerCoup(c: Combattant, id: string, monde: Monde): void {
  const coup = c.perso.coups[id];
  if (!coup) throw new Error(`${c.perso.id} : coup inconnu « ${id} »`);
  if (c.dash > 0) {
    c.dash = 0;
    c.rechargeDash = c.perso.stats.dashRecharge;
  }
  c.coup = id;
  c.frame = 0;
  c.instance++;
  c.charge = 0;
  c.bouton = boutonDe(id);
  c.touches = [];
  c.enchainer = null;
  if (coup.recharge) {
    c.recharges = c.recharges.filter((r) => r.coup !== id);
    c.recharges.push({ coup: id, ticks: coup.recharge });
  }
  if (coup.jauge) c.jauge = Math.max(0, c.jauge - coup.jauge);
  if (coup.unParSaut && !c.auSol) c.aeriensUtilises.push(id);
  emettre(monde, { type: "coup", source: c.id, x: c.x, y: c.y, cle: id });
  entrerFrame(c);
}

export function finirCoup(c: Combattant): void {
  c.coup = null;
  c.frame = 0;
  c.charge = 0;
  c.touches = [];
  c.enchainer = null;
}

/** Effets attachés à la frame dans laquelle le coup vient d'entrer. */
function entrerFrame(c: Combattant): void {
  for (const s of coupDe(c)?.statutsSoi ?? []) {
    if (s.frame === c.frame) appliquerStatut(c, s.statut);
  }
}

/**
 * Fin de tick : gel d'impact, enchaînement demandé pendant le tick, charge,
 * puis frame suivante. Appelé après la résolution des coups, pour que les
 * hitboxes testées soient celles de la frame jouée pendant ce tick.
 */
export function avancerFrame(c: Combattant, monde: Monde): void {
  if (c.horsJeu) return;
  if (c.gel > 0) {
    c.gel--;
    return;
  }
  if (c.enchainer !== null) {
    demarrerCoup(c, c.enchainer, monde);
    return;
  }
  const coup = coupDe(c);
  if (!coup) return;
  const charge = coup.charge;
  if (charge && c.frame === charge.frame && c.entreePrecedente & c.bouton && c.charge < charge.max) {
    c.charge++;
    return;
  }
  if (++c.frame >= coup.duree) finirCoup(c);
  else entrerFrame(c);
}

export function mouvementA(coup: CoupDef, frame: number) {
  let trouve;
  for (const m of coup.mouvement ?? []) if (dans(frame, m.de, m.a)) trouve = m;
  return trouve;
}

/** Hitbox placée dans le monde, retournée selon l'orientation. */
export function boiteHitbox(c: Combattant, hb: HitboxDef): Boite {
  const cx = c.x + c.orientation * hb.x;
  const cy = c.y - hb.y;
  const gauche = cx - Math.trunc(hb.l / 2);
  const haut = cy - Math.trunc(hb.h / 2);
  return { gauche, haut, droite: gauche + hb.l, bas: haut + hb.h };
}

export function hitboxesActives(c: Combattant): HitboxDef[] {
  const coup = coupDe(c);
  return coup?.hitboxes?.filter((hb) => dans(c.frame, hb.de, hb.a)) ?? [];
}

export function estInvulnerable(c: Combattant): boolean {
  if (c.invulnerable > 0) return true;
  const coup = coupDe(c);
  return coup?.invulnerable !== undefined && dans(c.frame, coup.invulnerable[0], coup.invulnerable[1]);
}

export function aArmure(c: Combattant): boolean {
  const coup = coupDe(c);
  if (coup?.armure && dans(c.frame, coup.armure[0], coup.armure[1])) return true;
  return aStatut(c, "armure");
}
