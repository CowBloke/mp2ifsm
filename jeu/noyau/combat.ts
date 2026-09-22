import { boiteDe, type Combattant } from "./combattant";
import { chevauche, type Boite } from "./collisions";
import {
  JAUGE_MAX, aArmure, boiteHitbox, coupDe, dans, estInvulnerable, finirCoup,
} from "./coups";
import type { HitboxDef } from "./definitions";
import { emettre } from "./evenements";
import type { Monde } from "./monde";
import { appliquerStatut, consommerUniques, multiplicateur } from "./statuts";
import { cosDeg, sinDeg } from "./trigo";

/*
 * Résolution des coups d'un tick.
 *
 * Toutes les touches sont d'abord collectées, puis appliquées : deux
 * combattants qui se frappent au même tick s'échangent leurs coups, sans
 * avantage pour celui qui a le plus petit numéro.
 */

/** Jauge d'ultime gagnée, en ‰ des dégâts infligés et subis. */
const GAIN_INFLIGE = 1100;
const GAIN_SUBI = 500;
/** Gel infligé à l'attaquant dont le coup est contré. */
const GEL_CONTRE = 24;

type Touche = {
  attaquant: Combattant;
  cible: Combattant;
  hb: HitboxDef;
  zone: Boite;
  cle: number;
  sens: 1 | -1;
  coup: string;
};

export function resoudreTouches(monde: Monde): void {
  if (monde.phase !== "combat") return;
  const touches: Touche[] = [];
  for (const a of monde.combattants) {
    if (a.ko || a.horsJeu || a.gel > 0 || a.coup === null) continue;
    for (const hb of coupDe(a)?.hitboxes ?? []) {
      if (!dans(a.frame, hb.de, hb.a)) continue;
      const zone = boiteHitbox(a, hb);
      for (const b of monde.combattants) {
        if (b === a || b.ko || b.horsJeu || estInvulnerable(b)) continue;
        const cle = (hb.groupe ?? 0) * 16 + b.id;
        if (a.touches.includes(cle) || touches.some((t) => t.attaquant === a && t.cle === cle)) continue;
        if (chevauche(zone, boiteDe(b))) {
          touches.push({ attaquant: a, cible: b, hb, zone, cle, sens: a.orientation, coup: a.coup });
        }
      }
    }
  }
  for (const t of touches) appliquer(t, monde);
}

/** Milieu de l'intersection entre la hitbox et la cible : point d'impact des effets. */
function impact(zone: Boite, cible: Boite): { x: number; y: number } {
  return {
    x: Math.trunc((Math.max(zone.gauche, cible.gauche) + Math.min(zone.droite, cible.droite)) / 2),
    y: Math.trunc((Math.max(zone.haut, cible.haut) + Math.min(zone.bas, cible.bas)) / 2),
  };
}

function appliquer(t: Touche, monde: Monde): void {
  const { attaquant: a, cible: b, hb } = t;
  a.touches.push(t.cle);
  const point = impact(t.zone, boiteDe(b));

  // Contre : la cible ne subit rien et riposte ; l'attaquant reste figé.
  const coupCible = coupDe(b);
  if (coupCible?.contre && dans(b.frame, coupCible.contre.de, coupCible.contre.a)) {
    b.enchainer = coupCible.contre.riposte;
    b.orientation = t.sens === 1 ? -1 : 1;
    a.gel = Math.max(a.gel, GEL_CONTRE);
    emettre(monde, { type: "contre", source: b.id, cible: a.id, ...point, cle: b.coup ?? "" });
    return;
  }

  const coup = a.perso.coups[t.coup];
  let degats = hb.degats;
  if (coup.charge && a.charge > 0) {
    degats += Math.trunc((degats * coup.charge.bonus * a.charge) / (coup.charge.max * 1000));
  }
  degats = Math.trunc((degats * multiplicateur(a, "degatsInfliges")) / 1000);
  degats = Math.trunc((degats * multiplicateur(b, "degatsRecus")) / 1000);
  consommerUniques(b);

  // Le surplus d'un coup fatal ne compte pas : seuls les PV réellement ôtés.
  degats = Math.min(degats, b.pv);
  b.pv -= degats;
  a.degatsInfliges += degats;
  // L'ultime ne recharge pas la jauge qui vient de le payer.
  if (!coup.jauge) a.jauge = Math.min(JAUGE_MAX, a.jauge + Math.trunc((degats * GAIN_INFLIGE) / 1000));
  b.jauge = Math.min(JAUGE_MAX, b.jauge + Math.trunc((degats * GAIN_SUBI) / 1000));

  const gel = hb.gel ?? Math.min(12, 3 + Math.trunc(degats / 12));
  a.gel = Math.max(a.gel, gel);
  b.gel = Math.max(b.gel, gel);
  if (hb.statut) appliquerStatut(b, hb.statut);
  if (coup.surTouche) a.enchainer = coup.surTouche.coup;

  const evenement = { source: a.id, cible: b.id, ...point, valeur: degats, cle: hb.effet ?? t.coup };
  if (b.pv === 0) {
    b.ko = true;
    ejecter(b, hb, t.sens);
    emettre(monde, { type: "touche", ...evenement });
    emettre(monde, { type: "ko", source: a.id, cible: b.id, ...point });
  } else if (aArmure(b)) {
    emettre(monde, { type: "armure", ...evenement });
  } else {
    ejecter(b, hb, t.sens);
    emettre(monde, { type: "touche", ...evenement });
  }
}

/** Interrompt la cible et la projette selon la hitbox. */
function ejecter(b: Combattant, hb: HitboxDef, sens: 1 | -1): void {
  const s = b.perso.stats;
  finirCoup(b);
  b.dash = 0;
  b.lag = 0;
  // Plus la cible a perdu de PV, plus elle vole loin.
  const manque = Math.trunc(((s.pv - b.pv) * 1000) / s.pv);
  let force = hb.recul + Math.trunc(((hb.croissance ?? 0) * manque) / 1000);
  force = Math.trunc((force * 100) / s.poids);
  // « + 0 » : pas de -0 dans l'état (il fausserait les comparaisons exactes).
  b.vx = Math.trunc((sens * cosDeg(hb.angle) * force) / 1000) + 0;
  b.vy = -Math.trunc((sinDeg(hb.angle) * force) / 1000) + 0;
  b.hitstun = hb.hitstun;
  b.orientation = sens === 1 ? -1 : 1;
  if (b.vy < 0) b.auSol = false;
}
