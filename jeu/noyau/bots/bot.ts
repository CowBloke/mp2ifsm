import { boiteDe, peutAgir, surPlateforme, type Combattant } from "../combattant";
import { coupDe, coupDisponible, dans, resoudreEmplacement } from "../coups";
import type { Emplacement } from "../definitions";
import {
  ACTIONS, ATTAQUE, BAS, DASH, DROITE, GAUCHE, HAUT, SAUT, SPECIAL, TOUTES, ULTIME, type Entree,
} from "../entrees";
import type { Monde } from "../monde";
import { aStatut } from "../statuts";
import { analyser, porteeTypique, type AnalyseCoup, type Zone } from "./analyse";

/*
 * Bots : une IA classique, déterministe (hasard à graine), qui joue avec
 * les mêmes entrées qu'un humain — la simulation ne sait pas qui est un
 * bot.
 *
 * Chaque tick : perception (les adversaires sont vus avec un temps de
 * réaction), récupération si le bot est hors de l'arène, esquive d'une
 * attaque qui arrive, choix d'un coup qui touche là où sera la cible,
 * sinon déplacement vers une distance de frappe. Les niveaux ne changent
 * que des paramètres.
 */

/** Donne l'entrée d'un combattant à chaque tick. */
export type Controleur = (monde: Monde, place: number) => Entree;

export type ParametresBot = {
  /** Retard de perception des adversaires, en ticks. */
  reaction: number;
  /** Ticks entre deux décisions d'attaque ou de placement. */
  reflexion: number;
  /** Part de décisions justes (sinon : coup au hasard, ou rien). */
  precision: number;
  /** Envie d'aller au contact. */
  agressivite: number;
  /** Probabilité d'esquiver (ou contrer) une attaque qui arrive. */
  esquive: number;
  /** Probabilité de poursuivre un enchaînement. */
  enchainement: number;
  /** Part de la charge maximale utilisée. */
  charge: number;
};

export const NIVEAUX_BOT: readonly ParametresBot[] = [
  { reaction: 22, reflexion: 14, precision: 0.5, agressivite: 0.55, esquive: 0.03, enchainement: 0.35, charge: 0.25 },
  { reaction: 14, reflexion: 9, precision: 0.72, agressivite: 0.7, esquive: 0.15, enchainement: 0.65, charge: 0.5 },
  { reaction: 8, reflexion: 5, precision: 0.88, agressivite: 0.8, esquive: 0.35, enchainement: 0.85, charge: 0.75 },
  { reaction: 4, reflexion: 3, precision: 0.97, agressivite: 0.85, esquive: 0.55, enchainement: 0.97, charge: 1 },
];

export const NOMS_NIVEAUX = ["Facile", "Moyen", "Difficile", "Expert"] as const;

/** Ce que le bot retient d'un combattant à un tick donné. */
type Vu = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  coup: string | null;
  frame: number;
  instance: number;
  orientation: 1 | -1;
  auSol: boolean;
  horsJeu: boolean;
  ko: boolean;
  combattant: Combattant;
};

const MEMOIRE = 40;

function voir(c: Combattant): Vu {
  return {
    x: c.x, y: c.y, vx: c.vx, vy: c.vy, coup: c.coup, frame: c.frame, instance: c.instance,
    orientation: c.orientation, auSol: c.auSol, horsJeu: c.horsJeu, ko: c.ko, combattant: c,
  };
}

function signe(v: number): -1 | 1 {
  return v < 0 ? -1 : 1;
}

function directionVers(dx: number): Entree {
  return dx < 0 ? GAUCHE : DROITE;
}

function chevaucheZone(z: Zone, cible: Zone, marge: number): boolean {
  return z.gauche - marge < cible.droite && cible.gauche < z.droite + marge
    && z.bas - marge < cible.haut && cible.bas < z.haut + marge;
}

export function creerBot(niveau: number, graine: number): Controleur {
  const p = NIVEAUX_BOT[Math.max(0, Math.min(NIVEAUX_BOT.length - 1, niveau))];
  let hasard = (graine >>> 0) || 1;
  const alea = () => {
    hasard = (Math.imul(hasard, 1664525) + 1013904223) >>> 0;
    return hasard / 4294967296;
  };

  const souvenirs: Vu[][] = [];
  let precedente: Entree = 0;
  /** Appuis (fronts) en attente, et touches tenues. */
  let appuisEnAttente: Entree = 0;
  let tenues: Entree = 0;
  let prochaineDecision = 0;
  const esquives = new Set<string>();
  let instanceSuivie = -1;
  let enchainer = false;
  let chargeVisee = 0;

  /** Entrée finale du tick : un appui déjà tenu est d'abord relâché, pour créer un front. */
  function emettre(): Entree {
    const bloques = appuisEnAttente & precedente & ACTIONS;
    const appuis = appuisEnAttente & ~bloques;
    appuisEnAttente = bloques;
    const e = (tenues | appuis) & ~bloques & TOUTES;
    precedente = e;
    return e;
  }

  function perception(monde: Monde): Vu[] {
    souvenirs.push(monde.combattants.map(voir));
    if (souvenirs.length > MEMOIRE) souvenirs.shift();
    return souvenirs[Math.max(0, souvenirs.length - 1 - p.reaction)];
  }

  /** Surface sous les pieds ou atteignable la plus proche : [x visé, y de la surface]. */
  function refuge(monde: Monde, moi: Combattant): { x: number; y: number; dessous: boolean } {
    const demi = moi.perso.stats.largeur;
    let meilleur = { x: moi.x, y: moi.y, dessous: false };
    let distance = Infinity;
    const surfaces = [
      ...monde.carte.solides.map((s) => ({ gauche: s.gauche, droite: s.droite, y: s.haut })),
      ...monde.carte.plateformes,
    ];
    for (const s of surfaces) {
      const x = Math.min(Math.max(moi.x, s.gauche + demi), s.droite - demi);
      const dessous = moi.x >= s.gauche && moi.x <= s.droite && moi.y <= s.y;
      const d = Math.abs(x - moi.x) + Math.max(0, moi.y - s.y) * 2;
      if (d < distance) {
        distance = d;
        meilleur = { x, y: s.y, dessous };
      }
    }
    return meilleur;
  }

  /** Hors de l'arène : aucune surface sous les pieds. */
  function horsScene(monde: Monde, moi: Combattant): boolean {
    if (moi.auSol) return false;
    const b = boiteDe(moi);
    const surfaces = [
      ...monde.carte.solides.map((s) => ({ gauche: s.gauche, droite: s.droite, y: s.haut })),
      ...monde.carte.plateformes,
    ];
    return !surfaces.some((s) => b.droite > s.gauche && b.gauche < s.droite && s.y >= moi.y);
  }

  function recuperer(monde: Monde, moi: Combattant): void {
    const r = refuge(monde, moi);
    const dx = r.x - moi.x;
    tenues = Math.abs(dx) > 1500 ? directionVers(dx) : 0;
    const sous = moi.y > r.y - moi.perso.stats.hauteur / 3;
    if (moi.vy >= 0 && sous) {
      if (moi.sautsRestants > 0) {
        appuisEnAttente |= SAUT;
        return;
      }
      const haut = resoudreEmplacement(moi, "special_haut");
      if (haut && coupDisponible(moi, haut) && moi.coup === null) {
        tenues |= HAUT;
        appuisEnAttente |= SPECIAL;
        return;
      }
    }
    if (Math.abs(dx) > 20_000 && moi.dashsRestants > 0 && moi.rechargeDash === 0 && moi.coup === null) {
      appuisEnAttente |= DASH;
    }
  }

  /** Une attaque adverse est en préparation et nous atteindra : esquiver (ou contrer). */
  function esquiver(moi: Combattant, vus: Vu[]): boolean {
    for (const o of vus) {
      if (o.combattant === moi || o.ko || o.horsJeu || o.coup === null) continue;
      const coup = o.combattant.perso.coups[o.coup];
      const hbs = coup?.hitboxes ?? [];
      if (hbs.length === 0) continue;
      const debut = Math.min(...hbs.map((h) => h.de));
      if (o.frame >= debut) continue;
      const cle = `${o.combattant.id}:${o.instance}`;
      if (esquives.has(cle)) continue;
      // La cible de ce coup, c'est nous ? (distance dans la portée du coup)
      const vers = (moi.x - o.x) * o.orientation;
      const portee = Math.max(...hbs.map((h) => h.x + h.l / 2));
      if (vers < -2000 || vers > portee + moi.perso.stats.largeur || Math.abs(moi.y - o.y) > 15_000) continue;
      esquives.add(cle);
      if (esquives.size > 64) esquives.clear();
      if (alea() >= p.esquive) continue;
      const contre = analyser(moi.perso).find((a) => a.contre && coupDisponible(moi, a.id));
      if (contre && alea() < 0.5 && moi.auSol) {
        tenues = BAS;
        appuisEnAttente |= SPECIAL;
      } else if (moi.rechargeDash === 0 && (moi.auSol || moi.dashsRestants > 0)) {
        tenues = directionVers(-(o.x - moi.x) || -o.orientation);
        appuisEnAttente |= DASH;
      } else {
        appuisEnAttente |= SAUT;
      }
      return true;
    }
    return false;
  }

  /** Entrée qui déclenche l'emplacement, vers la cible. */
  function commande(e: Emplacement, dx: number): { tenues: Entree; appui: Entree } {
    const dir = directionVers(dx);
    switch (e) {
      case "neutre": case "air_neutre": return { tenues: 0, appui: ATTAQUE };
      case "cote": case "air_cote": return { tenues: dir, appui: ATTAQUE };
      case "haut": case "air_haut": return { tenues: HAUT, appui: ATTAQUE };
      case "bas": case "air_bas": return { tenues: BAS, appui: ATTAQUE };
      case "special_neutre": return { tenues: 0, appui: SPECIAL };
      case "special_cote": return { tenues: dir, appui: SPECIAL };
      case "special_haut": return { tenues: HAUT, appui: SPECIAL };
      case "special_bas": return { tenues: BAS, appui: SPECIAL };
      case "ultime": return { tenues: 0, appui: ULTIME };
    }
  }

  /** Meilleur coup qui toucherait la cible là où elle sera, ou null. */
  function choisirAttaque(moi: Combattant, cible: Vu, dx: number): AnalyseCoup | null {
    const s = cible.combattant.perso.stats;
    const silence = aStatut(moi, "silence");
    let meilleur: AnalyseCoup | null = null;
    let score = 0;
    const candidats: AnalyseCoup[] = [];
    for (const a of analyser(moi.perso)) {
      if (a.aerien === moi.auSol || a.zones.length === 0 || a.contre) continue;
      if (a.emplacement === "special_haut" && moi.auSol && cible.y > moi.y - 8000) continue;
      if (silence && (a.emplacement.startsWith("special") || a.emplacement === "ultime")) continue;
      const id = resoudreEmplacement(moi, a.emplacement);
      if (!id || id !== a.id || !coupDisponible(moi, id)) continue;
      candidats.push(a);
      // Cible au moment où le coup devient actif.
      const t = Math.min(a.debut, 20);
      const fx = (cible.x + cible.vx * t - moi.x) * signe(dx);
      const fy = moi.y - (cible.y + (cible.auSol ? 0 : cible.vy * t));
      const zoneCible = { gauche: fx - s.largeur / 2, droite: fx + s.largeur / 2, bas: fy, haut: fy + s.hauteur };
      if (!a.zones.some((z) => chevaucheZone(z, zoneCible, 600))) continue;
      const valeur = (a.degats / (a.debut + 12)) * (a.emplacement === "ultime" ? 4 : 1) * (0.6 + 0.8 * alea());
      if (valeur > score) {
        score = valeur;
        meilleur = a;
      }
    }
    // Maladresse : un coup au hasard (souvent dans le vide), ou rien.
    if (alea() > p.precision) return candidats.length > 0 && alea() < 0.5 ? candidats[Math.floor(alea() * candidats.length)] : null;
    return meilleur;
  }

  /** Pendant un coup : poursuivre l'enchaînement, tenir la charge. */
  function pendantCoup(moi: Combattant): void {
    const coup = coupDe(moi);
    if (!coup) return;
    if (moi.instance !== instanceSuivie) {
      instanceSuivie = moi.instance;
      enchainer = alea() < p.enchainement;
      chargeVisee = coup.charge ? Math.floor(coup.charge.max * p.charge * (0.5 + alea() * 0.5)) : 0;
    }
    tenues &= ~(ATTAQUE | SPECIAL | ULTIME);
    if (coup.charge && moi.frame <= coup.charge.frame && moi.charge < chargeVisee) tenues |= moi.bouton;
    if (coup.suite && enchainer && dans(moi.frame, coup.suite.de, coup.suite.a)) appuisEnAttente |= ATTAQUE;
  }

  function placer(monde: Monde, moi: Combattant, cible: Vu, dx: number): void {
    const portee = porteeTypique(moi.perso) || 8000;
    const distance = Math.abs(dx);
    const dy = cible.y - moi.y;
    tenues = 0;
    if (distance > portee * 0.8 && alea() < p.agressivite + 0.2) tenues = directionVers(dx);
    else if (distance < portee * 0.35 && alea() < 0.3) tenues = directionVers(-dx);
    // Cible au-dessus, sur une plateforme : sauter la rejoindre.
    if (dy < -9000 && distance < 30_000 && moi.auSol && alea() < 0.6) appuisEnAttente |= SAUT;
    // Cible en dessous : descendre de la plateforme.
    else if (dy > 9000 && surPlateforme(moi, monde.carte) && alea() < 0.6) appuisEnAttente |= BAS;
    // Un peu d'imprévu : petits sauts.
    else if (moi.auSol && alea() < 0.04) appuisEnAttente |= SAUT;
    // Loin : dash pour revenir au contact.
    if (distance > portee * 3 && moi.rechargeDash === 0 && moi.auSol && alea() < p.agressivite * 0.3) {
      appuisEnAttente |= DASH;
    }
  }

  return (monde, place) => {
    const vus = perception(monde);
    const moi = monde.combattants[place];
    if (!moi || moi.ko || moi.horsJeu || monde.phase !== "combat") {
      tenues = 0;
      appuisEnAttente = 0;
      return emettre();
    }

    if (moi.coup !== null) pendantCoup(moi);
    const coup = coupDe(moi);
    const occupe = coup !== undefined && (coup.annulable === undefined || moi.frame < coup.annulable);
    if (!peutAgir(moi, monde) || occupe) return emettre();

    if (horsScene(monde, moi)) {
      recuperer(monde, moi);
      return emettre();
    }

    const cibles = vus.filter((o) => o.combattant !== moi && !o.ko && !o.horsJeu);
    if (cibles.length === 0) {
      tenues = 0;
      return emettre();
    }
    if (esquiver(moi, vus)) return emettre();
    if (monde.tick < prochaineDecision) return emettre();
    prochaineDecision = monde.tick + p.reflexion;

    let cible = cibles[0];
    for (const o of cibles) if (Math.abs(o.x - moi.x) + Math.abs(o.y - moi.y) < Math.abs(cible.x - moi.x) + Math.abs(cible.y - moi.y)) cible = o;
    const dx = cible.x - moi.x;

    const attaque = choisirAttaque(moi, cible, dx);
    if (attaque) {
      const c = commande(attaque.emplacement, dx);
      // Coup non orienté : se tourner d'abord vers la cible.
      if ((c.tenues & (GAUCHE | DROITE)) === 0 && signe(dx) !== moi.orientation && Math.abs(dx) > 1000) {
        tenues = directionVers(dx);
        prochaineDecision = monde.tick + 1;
        return emettre();
      }
      tenues = c.tenues;
      appuisEnAttente |= c.appui;
      return emettre();
    }
    placer(monde, moi, cible, dx);
    return emettre();
  };
}
