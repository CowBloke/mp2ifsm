import type { Carte } from "../noyau/carte";
import type { Combattant } from "../noyau/combattant";
import { persoParId } from "../noyau/contenu";
import type { Evenement, TypeEvenement } from "../noyau/evenements";
import type { Monde, Phase } from "../noyau/monde";
import type { Reglages } from "../noyau/regles";
import type { Ecrivain, Lecteur } from "./binaire";

/*
 * Instantané de l'état complet d'une partie, en binaire.
 *
 * Tout l'état du monde voyage (le client en a besoin pour prédire son
 * propre personnage exactement comme le serveur), sauf la carte et les
 * réglages, fixes pendant la partie et envoyés à son début. Les listes
 * de champs sont écrites et lues dans le même ordre ; un test
 * aller-retour sur des parties réelles garantit qu'aucun n'est oublié.
 */

type ChampsNumeriques = { [K in keyof Combattant]: Combattant[K] extends number ? K : never }[keyof Combattant];
type ChampsBooleens = { [K in keyof Combattant]: Combattant[K] extends boolean ? K : never }[keyof Combattant];

const NUMERIQUES = [
  "x", "y", "vx", "vy", "sautsRestants", "dashsRestants", "dash", "rechargeDash", "pv", "jauge",
  "frame", "instance", "charge", "bouton", "hitstun", "gel", "lag", "invulnerable", "traversee",
  "entreePrecedente", "tampon", "tamponAge", "victoires", "degatsInfliges",
] as const satisfies readonly ChampsNumeriques[];
const BOOLEENS = ["auSol", "ko", "horsJeu"] as const satisfies readonly ChampsBooleens[];

const PHASES: readonly Phase[] = ["decompte", "combat", "finManche", "finPartie"];
const TYPES: readonly TypeEvenement[] = [
  "touche", "armure", "contre", "ko", "chute", "coup", "saut", "dash", "atterrissage", "phase",
];

/** Événement daté du tick où il s'est produit. */
export type EvenementDate = { tick: number; evenement: Evenement };

export type Instantane = {
  monde: Monde;
  /** Par place : numéro de la dernière entrée du joueur prise en compte. */
  acks: number[];
  /** Événements survenus depuis l'instantané précédent. */
  evenements: EvenementDate[];
};

function ecrireCombattant(e: Ecrivain, c: Combattant): void {
  e.naturel(c.id).texte(c.perso.id).entier(c.orientation);
  for (const k of NUMERIQUES) e.entier(c[k]);
  for (const k of BOOLEENS) e.booleen(c[k]);
  e.texte(c.coup ?? "").texte(c.enchainer ?? "");
  e.naturel(c.touches.length);
  for (const t of c.touches) e.entier(t);
  e.naturel(c.recharges.length);
  for (const r of c.recharges) e.texte(r.coup).entier(r.ticks);
  e.naturel(c.statuts.length);
  for (const s of c.statuts) e.texte(s.id).entier(s.ticks);
  e.naturel(c.aeriensUtilises.length);
  for (const a of c.aeriensUtilises) e.texte(a);
}

function lireCombattant(l: Lecteur): Combattant {
  const id = l.naturel();
  const perso = persoParId(l.texte());
  const orientation = l.entier() >= 0 ? 1 : -1;
  const c = { id, perso, orientation } as Record<string, unknown>;
  for (const k of NUMERIQUES) c[k] = l.entier();
  for (const k of BOOLEENS) c[k] = l.booleen();
  c.coup = l.texte() || null;
  c.enchainer = l.texte() || null;
  c.touches = Array.from({ length: l.naturel() }, () => l.entier());
  c.recharges = Array.from({ length: l.naturel() }, () => ({ coup: l.texte(), ticks: l.entier() }));
  c.statuts = Array.from({ length: l.naturel() }, () => ({ id: l.texte(), ticks: l.entier() }));
  c.aeriensUtilises = Array.from({ length: l.naturel() }, () => l.texte());
  return c as Combattant;
}

function ecrireEvenement(e: Ecrivain, { tick, evenement: ev }: EvenementDate): void {
  e.naturel(tick).naturel(TYPES.indexOf(ev.type)).entier(ev.source).entier(ev.cible)
    .entier(ev.x).entier(ev.y).entier(ev.valeur).texte(ev.cle);
}

function lireEvenement(l: Lecteur): EvenementDate {
  const tick = l.naturel();
  const type = TYPES[l.naturel()];
  if (!type) throw new RangeError("type d'événement inconnu");
  return {
    tick,
    evenement: { type, source: l.entier(), cible: l.entier(), x: l.entier(), y: l.entier(), valeur: l.entier(), cle: l.texte() },
  };
}

export function ecrireInstantane(e: Ecrivain, i: Instantane): void {
  const m = i.monde;
  e.naturel(m.tick).naturel(PHASES.indexOf(m.phase)).naturel(m.phaseTicks).naturel(m.manche)
    .naturel(m.chrono).entier(m.vainqueurManche).entier(m.vainqueur);
  e.naturel(m.combattants.length);
  for (const c of m.combattants) ecrireCombattant(e, c);
  e.naturel(i.acks.length);
  for (const a of i.acks) e.naturel(a);
  e.naturel(i.evenements.length);
  for (const ev of i.evenements) ecrireEvenement(e, ev);
}

export function lireInstantane(l: Lecteur, contexte: { carte: Carte; reglages: Reglages }): Instantane {
  const tick = l.naturel();
  const phase = PHASES[l.naturel()];
  if (!phase) throw new RangeError("phase inconnue");
  const monde: Monde = {
    tick,
    carte: contexte.carte,
    reglages: contexte.reglages,
    phase,
    phaseTicks: l.naturel(),
    manche: l.naturel(),
    chrono: l.naturel(),
    vainqueurManche: l.entier(),
    vainqueur: l.entier(),
    combattants: [],
    evenements: [],
  };
  monde.combattants = Array.from({ length: l.naturel() }, () => lireCombattant(l));
  const acks = Array.from({ length: l.naturel() }, () => l.naturel());
  const evenements = Array.from({ length: l.naturel() }, () => lireEvenement(l));
  return { monde, acks, evenements };
}
