import type { Point } from "../../noyau/carte";
import { avancerCombattant, type Combattant } from "../../noyau/combattant";
import { MS_PAR_TICK } from "../../noyau/constantes";
import { carteParId } from "../../noyau/contenu";
import { avancerFrame } from "../../noyau/coups";
import type { Entree } from "../../noyau/entrees";
import type { Evenement } from "../../noyau/evenements";
import { creerHorloge, fractionTick, ticksAJouer } from "../../noyau/horloge";
import type { Monde, Phase } from "../../noyau/monde";
import type { EvenementDate } from "../../protocole/etat";
import { B_ETAT, decoderBinaire, lireEtat, type DebutPartie } from "../../protocole/messages";
import type { SessionJeu, VueJeu } from "../session";
import type { ConnexionJeu } from "./connexion";

/*
 * Partie en réseau, vue d'un client.
 *
 * Le serveur fait foi et envoie l'état complet ~30 fois par seconde.
 *
 *  - Les AUTRES combattants sont affichés un peu dans le passé, par
 *    interpolation entre deux instantanés : mouvement fluide malgré la
 *    gigue du réseau.
 *  - SON combattant est prédit : chaque entrée est jouée localement tout
 *    de suite (même code que le serveur), puis, à chaque instantané, on
 *    repart de l'état officiel et on rejoue les entrées que le serveur
 *    n'a pas encore prises en compte. Les petits écarts sont lissés.
 *
 * Aucune dépendance au rendu : testable sans navigateur.
 */

type Recu = { tick: number; monde: Monde };

/** Écart au-delà duquel la correction est immédiate (téléportation, réapparition). */
const ECART_MAX = 30_000;
const LISSAGE_ERREUR_MS = 60;
const GARDE_INSTANTANES = 40;

function cloner(c: Combattant): Combattant {
  return {
    ...c,
    touches: [...c.touches],
    recharges: c.recharges.map((r) => ({ ...r })),
    statuts: c.statuts.map((s) => ({ ...s })),
    aeriensUtilises: [...c.aeriensUtilises],
  };
}

export type SessionReseau = SessionJeu & {
  /** Retard d'affichage des autres combattants, en ticks (mesures). */
  delai(): number;
  /** Mesures pour le débogage et les tests. */
  diagnostic(): { envoyees: number; enAttenteAck: number; dernierAck: number; recus: number; dernierTick: number };
};

export function creerSessionReseau(connexion: ConnexionJeu, debut: DebutPartie, maintenant = () => performance.now()): SessionReseau {
  const contexte = { carte: carteParId(debut.carte), reglages: debut.reglages };
  const local = debut.place;
  const recus: Recu[] = [];
  let enAttente: EvenementDate[] = [];
  const horloge = creerHorloge();
  let historique: { seq: number; entree: Entree }[] = [];
  let predit: Combattant | null = null;
  const erreur = { x: 0, y: 0 };
  let envoyees = 0;
  let dernierAck = 0;
  // Horloge du serveur estimée : tick serveur ≈ temps local (en ticks) + décalage.
  let decalage: number | null = null;
  let gigue = 1;
  let dernierRendu = -Infinity;

  const tempsTicks = () => maintenant() / MS_PAR_TICK;

  /** Contexte de prédiction : le dernier état connu, avec la phase qu'aura le serveur k ticks plus tard. */
  function contextePrediction(base: Monde, k: number): Monde {
    let phase: Phase = base.phase;
    if (phase === "decompte" && base.phaseTicks + k >= base.reglages.dureeDecompte) phase = "combat";
    // Entités jetables : ce que la prédiction ferait apparaître n'altère
    // jamais l'état reçu du serveur (qui, seul, crée les vraies).
    return { ...base, phase, evenements: [], entites: [], prochaineEntite: 0 };
  }

  function etape(c: Combattant, entree: Entree, ctx: Monde): void {
    avancerCombattant(c, entree, ctx);
    avancerFrame(c, ctx);
  }

  function reconcilier(m: Monde, ack: number): void {
    const officiel = m.combattants[local];
    if (!officiel) return;
    const avant = predit;
    predit = cloner(officiel);
    historique = historique.filter((h) => h.seq > ack);
    historique.forEach((h, k) => etape(predit!, h.entree, contextePrediction(m, k + 1)));
    if (avant) {
      const dx = avant.x + erreur.x - predit.x;
      const dy = avant.y + erreur.y - predit.y;
      if (Math.hypot(dx, dy) > ECART_MAX) erreur.x = erreur.y = 0;
      else {
        erreur.x = dx;
        erreur.y = dy;
      }
    }
  }

  const desabonner = connexion.surInstantane((octets) => {
    const m = decoderBinaire(octets);
    if (m.b !== B_ETAT) return;
    const i = lireEtat(m.lecteur, contexte);
    const dernier = recus[recus.length - 1];
    if (dernier && i.monde.tick <= dernier.tick) return;
    recus.push({ tick: i.monde.tick, monde: i.monde });
    if (recus.length > GARDE_INSTANTANES) recus.shift();
    enAttente.push(...i.evenements);

    // Estimation de l'horloge serveur, et de la gigue d'arrivée.
    const estime = i.monde.tick - tempsTicks();
    if (decalage === null || Math.abs(estime - decalage) > 60) decalage = estime;
    else {
      gigue += (Math.abs(estime - decalage) - gigue) * 0.1;
      decalage += (estime - decalage) * 0.05;
    }
    dernierAck = i.acks[local] ?? 0;
    if (local >= 0) reconcilier(i.monde, dernierAck);
  });

  /** Retard d'affichage des autres : deux instantanés, plus la gigue observée. */
  function delai(): number {
    const base = local >= 0 ? 3 : 7;
    return Math.min(14, base + Math.ceil(gigue * 2));
  }

  function tickRendu(): number {
    return tempsTicks() + (decalage ?? 0) - delai();
  }

  return {
    delai,

    diagnostic() {
      return {
        envoyees, enAttenteAck: historique.length, dernierAck, recus: recus.length,
        dernierTick: recus[recus.length - 1]?.tick ?? 0,
      };
    },

    avancer(ecouleMs, lireEntree) {
      const ticks = ticksAJouer(horloge, ecouleMs);
      const base = recus[recus.length - 1]?.monde;
      for (let i = 0; i < ticks; i++) {
        if (local < 0) continue;
        const entree = lireEntree();
        historique.push({ seq: connexion.entree(entree), entree });
        envoyees++;
        if (historique.length > 240) historique.shift();
        if (predit && base) etape(predit, entree, contextePrediction(base, historique.length));
      }
      const k = Math.exp(-ecouleMs / LISSAGE_ERREUR_MS);
      erreur.x *= k;
      erreur.y *= k;
    },

    monde() {
      return recus[recus.length - 1]?.monde ?? vide();
    },

    vue(): VueJeu {
      if (recus.length === 0) {
        return { monde: vide(), positions: [], positionsEntites: new Map(), evenements: [], alpha: 0, local };
      }
      const t = tickRendu();
      // a : dernier instantané au plus tard à t ; b : le suivant.
      let ia = recus.length - 1;
      while (ia > 0 && recus[ia].tick > t) ia--;
      const a = recus[ia];
      const b = recus[ia + 1];
      const alpha = b ? Math.min(1, Math.max(0, (t - a.tick) / (b.tick - a.tick))) : 0;

      const positions: Point[] = a.monde.combattants.map((c, i) => {
        if (i === local && predit) return { x: predit.x + erreur.x, y: predit.y + erreur.y };
        const cb = b?.monde.combattants[i];
        if (!cb || Math.abs(cb.x - c.x) > ECART_MAX || Math.abs(cb.y - c.y) > ECART_MAX) return { x: c.x, y: c.y };
        return { x: c.x + (cb.x - c.x) * alpha, y: c.y + (cb.y - c.y) * alpha };
      });

      // Les événements sont joués quand l'affichage atteint leur tick.
      const evenements: Evenement[] = [];
      const restants: EvenementDate[] = [];
      for (const e of enAttente) {
        if (e.tick <= t) {
          if (e.tick > dernierRendu - 120) evenements.push(e.evenement);
        } else restants.push(e);
      }
      enAttente = restants;
      dernierRendu = t;

      const monde: Monde = {
        ...a.monde,
        combattants: a.monde.combattants.map((c, i) => (i === local && predit ? predit : c)),
      };
      const suivantes = new Map((b?.monde.entites ?? []).map((e) => [e.id, e]));
      const positionsEntites = new Map(a.monde.entites.map((e) => {
        const eb = suivantes.get(e.id);
        return [e.id, eb ? { x: e.x + (eb.x - e.x) * alpha, y: e.y + (eb.y - e.y) * alpha } : { x: e.x, y: e.y }];
      }));
      return { monde, positions, positionsEntites, evenements, alpha: local >= 0 ? fractionTick(horloge) : alpha, local };
    },

    detruire() {
      desabonner();
    },
  };

  function vide(): Monde {
    return {
      tick: 0, carte: contexte.carte, reglages: contexte.reglages, phase: "decompte", phaseTicks: 0, manche: 1,
      chrono: contexte.reglages.dureeManche, vainqueurManche: -1, vainqueur: -1, combattants: [], entites: [],
      prochaineEntite: 0, evenements: [],
    };
  }
}
