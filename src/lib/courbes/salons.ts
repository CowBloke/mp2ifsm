import "server-only";
import { randomInt } from "node:crypto";
import { choisirTir } from "./bots";
import { chronologie } from "./chronologie";
import { enregistrerPartie, enregistrerTirs, type TirVictorieux } from "./classement";
import { ErreurExpression, verifier, type Contraintes, type Expression } from "./expression";
import {
  JOUEURS_MAX, REGLAGES_DEFAUT, VOLEES_MAX, VUE_DEPART, VUE_TRACE,
  aleatoire, cercleVisible, corrigerReglages, depart, devoiler, genererArene, nouveauVoile, visible,
  type Cercle, type Reglages, type StyleCarte,
} from "./monde";
import { simuler, type Resultat } from "./simulation";
import type { Phase, SalonOuvert, VueEvenement, VueSalon, VueTrace, VueTraces } from "./vue";

/*
 * Curve Fight : les salons, en mémoire dans le processus du site.
 *
 * Le jeu est au tour par tour : les navigateurs interrogent l'état par
 * attente longue (GET qui ne répond qu'au prochain changement) et le
 * serveur calcule chaque volée d'un coup. Aucun WebSocket, aucun service
 * de plus. Un redéploiement met fin aux parties en cours ; les
 * classements, eux, sont en base (classement.ts).
 */

export class ErreurSalon extends Error {}

type Participant = {
  id: string; nom: string; couleur: number; bot: boolean;
  /** Prend part à la partie en cours (faux : arrivé en route, spectateur). */
  enJeu: boolean;
  x: number; y: number; vivant: boolean;
  pret: boolean; expression: Expression | null;
  points: number; eliminations: number; manchesGagnees: number;
  /** Dernière interrogation (ms). */
  vu: number;
  voile: Uint8Array | null;
  sillages: { volee: number; pts: number[] }[];
  historique: { volee: number; source: string; bilan: string }[];
  /** Éliminé : le joueur qu'il conseille, et la courbe qu'il lui propose (cachée jusqu'au départ). */
  conseil: { cible: string; expression: Expression | null } | null;
};

/** Courbe proposée par un éliminé : rejouée seule depuis sa cible, elle ne touche personne pour de vrai. */
type Conseil = {
  id: string; cible: string; source: string;
  traces: Resultat["traces"];
  /** Qui elle aurait éliminé, et quand. */
  touches: { victime: string; tick: number; x: number; y: number }[];
};

type Volee = {
  n: number; manche: number; volee: number;
  tRevelation: number; tAnimation: number; tFin: number;
  resultat: Resultat;
  expressions: { id: string; source: string | null }[];
  crateresAvant: number;
  vivantsAvant: Set<string>;
  conseils: Conseil[];
  /** Ticks d'animation : la plus longue des courbes, fantômes compris. */
  ticks: number;
};

type Salon = {
  code: string; hote: string; reglages: Reglages; phase: Phase;
  version: number; diffusee: number; cree: number;
  participants: Map<string, Participant>;
  manche: number; volee: number; compteurVolees: number;
  obstacles: Cercle[]; crateres: Cercle[]; carte: StyleCarte;
  echeance: number; transition: number;
  tir: Volee | null;
  gagnants: string[];
  minuterie: ReturnType<typeof setTimeout> | null;
  attentes: Set<() => void>;
  rnd: () => number;
};

const SALONS_MAX = 40;
const PARTICIPANTS_MAX = 40;
/** Sans nouvelles depuis ce délai (l'attente longue revient toutes les 15 s), un joueur est absent. */
const PRESENCE = 25_000;
const ABANDON = 3 * 60_000;
const NOMS_BOTS = ["Euler", "Gauss", "Cauchy", "Fourier", "Riemann", "Noether", "Galois", "Lagrange", "Germain"];

const memoire = globalThis as unknown as { courbesSalons?: Map<string, Salon> };
const salons = (memoire.courbesSalons ??= new Map<string, Salon>());

const present = (p: Participant, t: number) => p.bot || t - p.vu < PRESENCE;
const enLice = (s: Salon) => [...s.participants.values()].filter((p) => p.enJeu && p.vivant);

function contraintes(r: Reglages): Contraintes {
  return { familles: r.familles, longueurMax: r.longueurMax, equadiff: r.tir === "equadiff" };
}

/* --- Réveil des attentes longues -------------------------------------- */

/** Réveille les navigateurs en attente si le salon a changé depuis la dernière fois. */
function diffuser(s: Salon): void {
  if (s.version === s.diffusee) return;
  s.diffusee = s.version;
  const attentes = [...s.attentes];
  s.attentes.clear();
  for (const reveiller of attentes) reveiller();
}

function fermer(s: Salon): void {
  if (s.minuterie) clearTimeout(s.minuterie);
  salons.delete(s.code);
  s.version++;
  diffuser(s);
}

/** Attend le prochain changement du salon, au plus `delai` ms. */
export function attendre(code: string, version: number, delai: number, signal: AbortSignal): Promise<void> {
  const s = salons.get(code);
  if (!s || s.version !== version || signal.aborted) return Promise.resolve();
  return new Promise((resoudre) => {
    const fin = () => {
      clearTimeout(minuterie);
      s.attentes.delete(fin);
      signal.removeEventListener("abort", fin);
      resoudre();
    };
    const minuterie = setTimeout(fin, delai);
    s.attentes.add(fin);
    signal.addEventListener("abort", fin);
  });
}

/* --- Déroulement ------------------------------------------------------- */

function programmer(s: Salon): void {
  if (s.minuterie) clearTimeout(s.minuterie);
  s.minuterie = null;
  const t = Date.now();
  let dans = 0;
  // En préparation on repasse aussi toutes les 5 s : un joueur parti ne bloque pas les autres.
  if (s.phase === "preparation") dans = Math.min(5000, s.echeance ? Math.max(50, s.echeance - t) : 5000);
  else if (s.phase === "volee" && s.tir) dans = Math.max(50, s.tir.tFin - t);
  else if (s.phase === "finManche") dans = Math.max(50, s.transition - t);
  if (!dans) return;
  s.minuterie = setTimeout(() => {
    if (salons.get(s.code) === s) avancer(s);
  }, dans);
  s.minuterie.unref?.();
}

/** Fait passer le salon aux phases dues ; à appeler avant toute lecture. */
function avancer(s: Salon): void {
  for (let garde = 0; garde < 6; garde++) {
    const t = Date.now();
    if (s.phase === "preparation") {
      if (enLice(s).length <= 1) { finDeManche(s, t); continue; }
      const attendus = enLice(s).filter((p) => !p.bot && present(p, t));
      if (attendus.every((p) => p.pret) || (s.echeance && t >= s.echeance)) { lancerVolee(s, t); continue; }
    } else if (s.phase === "volee" && s.tir && t >= s.tir.tFin) {
      if (enLice(s).length <= 1 || s.volee >= VOLEES_MAX) finDeManche(s, t);
      else { s.volee++; ouvrirPreparation(s, t); }
      continue;
    } else if (s.phase === "finManche" && t >= s.transition) {
      nouvelleManche(s, t);
      continue;
    }
    break;
  }
  // L'hôte parti passe la main au premier humain présent.
  const t = Date.now();
  const hote = s.participants.get(s.hote);
  if (!hote || !present(hote, t)) {
    const suivant = [...s.participants.values()].find((p) => !p.bot && present(p, t));
    if (suivant && suivant.id !== s.hote) { s.hote = suivant.id; s.version++; }
  }
  diffuser(s);
  programmer(s);
}

function ouvrirPreparation(s: Salon, t: number): void {
  s.phase = "preparation";
  s.echeance = s.reglages.temps ? t + s.reglages.temps * 1000 : 0;
  for (const p of s.participants.values()) {
    p.pret = false; p.expression = null;
    // Le conseiller garde sa cible tant qu'elle est en vie.
    const cible = p.conseil && s.participants.get(p.conseil.cible);
    p.conseil = cible && cible.vivant && !p.vivant ? { cible: cible.id, expression: null } : null;
  }
  s.version++;
}

function nouvelleManche(s: Salon, t: number): void {
  const joueurs = [...s.participants.values()].filter((p) => p.enJeu);
  const arene = genererArene(randomInt(2 ** 31), joueurs.length, s.reglages.obstacles, s.reglages.carte,
    s.reglages.mode === "centre");
  s.manche++;
  s.volee = 1;
  s.obstacles = arene.obstacles;
  s.carte = arene.style;
  s.crateres = [];
  s.tir = null;
  s.gagnants = [];
  joueurs.forEach((p, i) => {
    p.x = arene.positions[i].x;
    p.y = arene.positions[i].y;
    p.vivant = true;
    p.sillages = [];
    p.historique = [];
    p.voile = null;
    if (s.reglages.mode === "brouillard" && !p.bot) {
      p.voile = nouveauVoile();
      devoiler(p.voile, p.x, p.y, VUE_DEPART);
    }
  });
  ouvrirPreparation(s, t);
}

function bilanTir(resultat: Resultat, id: string): string {
  const touches = resultat.evenements.filter((e) => e.type === "elimination" && e.tueur === id);
  const victimes = touches.filter((e) => e.type === "elimination" && e.victime !== id).length;
  const ami = touches.length > victimes ? "tir ami" : "";
  if (victimes) return [victimes > 1 ? `${victimes} éliminations` : "1 élimination", ami].filter(Boolean).join(" · ");
  if (ami) return ami;
  const fins = resultat.traces.filter((tr) => tr.joueur === id).map((tr) => tr.fin);
  const mots = { bord: "sortie de l’arène", obstacle: "obstacle", rupture: "courbe rompue",
                 domaine: "hors du domaine", mort: "interrompue", longueur: "à bout de souffle" };
  return [...new Set(fins.map((f) => mots[f]))].join(" · ") || "aucun tir";
}

/** Délai entre le dévoilement des expressions et le départ des courbes (ms). */
export function delaiRevelation(nbTirs: number): number {
  return nbTirs ? Math.min(6000, 1800 + 700 * nbTirs) : 1500;
}
/** Temps laissé à la fin d'une volée, courbes arrêtées, avant la suite (ms). */
const APRES_VOLEE = 2200;
const ENTRE_MANCHES = 5000;

function lancerVolee(s: Salon, t: number): void {
  const lice = enLice(s);
  const regles = contraintes(s.reglages);
  const mode = s.reglages.mode;
  const tirAmi = mode === "centre";
  const tireur = (p: Participant, expr: Expression | null) => ({ id: p.id, x: p.x, y: p.y, expr, depart: depart(mode, p) });
  for (const bot of lice.filter((p) => p.bot)) {
    const autres = lice.filter((p) => p !== bot).map((p) => tireur(p, null));
    bot.expression = choisirTir(tireur(bot, null), autres, s.obstacles, s.crateres, regles, s.rnd, tirAmi);
    bot.pret = true;
  }

  const tireurs = lice.map((p) => tireur(p, p.pret ? p.expression : null));
  const resultat = simuler(tireurs, s.obstacles, s.crateres, s.reglages.tir, { tirAmi });
  const crateresAvant = s.crateres.length;
  s.crateres.push(...resultat.crateres);

  const palmares = new Map<string, TirVictorieux>();
  for (const e of resultat.evenements) {
    if (e.type !== "elimination") continue;
    const tueur = s.participants.get(e.tueur)!, victime = s.participants.get(e.victime)!;
    victime.vivant = false;
    // Tir ami : on s'élimine soi-même, sans point.
    if (tueur === victime) continue;
    tueur.eliminations++;
    tueur.points++;
    if (!tueur.bot && !victime.bot && tueur.expression) {
      const tir = palmares.get(tueur.id)
        ?? { userId: tueur.id, expression: tueur.expression.source, victimes: 0, longueur: 0 };
      tir.victimes++;
      tir.longueur = Math.max(tir.longueur, e.longueur);
      palmares.set(tueur.id, tir);
    }
  }
  void enregistrerTirs([...palmares.values()], s.reglages);

  for (const p of lice) {
    if (!p.pret || !p.expression) continue;
    p.historique.push({ volee: s.volee, source: p.expression.source, bilan: bilanTir(resultat, p.id) });
    for (const tr of resultat.traces) {
      if (tr.joueur !== p.id) continue;
      if (p.voile) for (let i = 0; i < tr.pts.length; i += 2) devoiler(p.voile, tr.pts[i], tr.pts[i + 1], VUE_TRACE);
      // Un point sur trois suffit à redessiner le couloir dégagé.
      const pts: number[] = [];
      for (let i = 0; i < tr.pts.length; i += 6) pts.push(tr.pts[i], tr.pts[i + 1]);
      pts.push(tr.pts[tr.pts.length - 2], tr.pts[tr.pts.length - 1]);
      p.sillages.push({ volee: s.volee, pts });
    }
  }

  // Les conseils des éliminés : chacun rejoué seul depuis sa cible, sur l'arène d'avant la volée.
  const conseils: Conseil[] = [];
  const crateresDAvant = s.crateres.slice(0, crateresAvant);
  for (const p of s.participants.values()) {
    const cible = p.conseil && s.participants.get(p.conseil.cible);
    if (!p.conseil?.expression || !cible || !lice.includes(cible)) continue;
    const essai = simuler(
      [tireur(cible, p.conseil.expression), ...lice.filter((q) => q !== cible).map((q) => tireur(q, null))],
      s.obstacles, crateresDAvant, s.reglages.tir, { tirAmi });
    conseils.push({
      id: p.id, cible: cible.id, source: p.conseil.expression.source, traces: essai.traces,
      touches: essai.evenements.flatMap((e) => (e.type === "elimination"
        ? [{ victime: e.victime, tick: e.tick, x: e.x, y: e.y }] : [])),
    });
  }
  const ticks = Math.max(resultat.ticks, ...conseils.map((c) => Math.max(...c.traces.map((tr) => tr.pts.length / 2 - 1))));

  const nbTirs = tireurs.filter((x) => x.expr).length;
  const revelation = delaiRevelation(nbTirs);
  // Même calcul que chez les navigateurs : ralentis et accéléré compris.
  const animation = chronologie(ticks, resultat.evenements.flatMap((e) => (e.type === "elimination" ? [e] : [])), lice.length).duree;
  s.tir = {
    n: ++s.compteurVolees, manche: s.manche, volee: s.volee,
    tRevelation: t, tAnimation: t + revelation, tFin: t + revelation + animation + APRES_VOLEE,
    resultat,
    expressions: lice.map((p) => ({ id: p.id, source: p.pret && p.expression ? p.expression.source : null })),
    crateresAvant,
    vivantsAvant: new Set(lice.map((p) => p.id)),
    conseils, ticks,
  };
  s.phase = "volee";
  for (const p of s.participants.values()) {
    p.pret = false; p.expression = null;
    if (p.conseil) p.conseil.expression = null;
  }
  s.version++;
}

function finDeManche(s: Salon, t: number): void {
  const survivants = enLice(s);
  s.gagnants = survivants.map((p) => p.id);
  if (survivants.length === 1) {
    survivants[0].points += 2;
    survivants[0].manchesGagnees++;
  }
  if (s.manche >= s.reglages.manches) {
    s.phase = "fin";
    const joueurs = classer(s);
    void enregistrerPartie(joueurs.filter((p) => !p.bot).map((p) => ({
      userId: p.id, rang: 1 + joueurs.filter((q) => !q.bot && devant(q, p)).length,
      points: p.points, eliminations: p.eliminations, manchesGagnees: p.manchesGagnees,
    })), s.reglages);
  } else {
    s.phase = "finManche";
    s.transition = t + ENTRE_MANCHES;
  }
  s.version++;
}

const devant = (a: Participant, b: Participant) =>
  a.points > b.points || (a.points === b.points && a.eliminations > b.eliminations);
function classer(s: Salon): Participant[] {
  return [...s.participants.values()].filter((p) => p.enJeu)
    .sort((a, b) => (devant(a, b) ? -1 : devant(b, a) ? 1 : 0));
}

/* --- Actions des joueurs ----------------------------------------------- */

function purger(): void {
  const t = Date.now();
  for (const [code, s] of salons) {
    const humains = [...s.participants.values()].filter((p) => !p.bot);
    if (humains.every((p) => t - p.vu > ABANDON) || t - s.cree > 8 * 3_600_000) {
      fermer(s);
    }
  }
}

function trouver(code: string): Salon {
  const s = salons.get(code);
  if (!s) throw new ErreurSalon("Ce salon n’existe plus");
  return s;
}

function couleurLibre(s: Salon): number {
  const prises = new Set([...s.participants.values()].map((p) => p.couleur));
  for (let c = 0; c < JOUEURS_MAX; c++) if (!prises.has(c)) return c;
  return s.participants.size % JOUEURS_MAX;
}

function nouveau(id: string, nom: string, couleur: number, bot: boolean): Participant {
  return {
    id, nom, couleur, bot, enJeu: false, x: 0, y: 0, vivant: false, pret: false, expression: null,
    points: 0, eliminations: 0, manchesGagnees: 0, vu: Date.now(), voile: null, sillages: [], historique: [],
    conseil: null,
  };
}

type Membre = { id: string; nom: string };

export function creerSalon(u: Membre): string {
  purger();
  if (salons.size >= SALONS_MAX) throw new ErreurSalon("Trop de salons ouverts, rejoins-en un");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
  } while (salons.has(code));
  const s: Salon = {
    code, hote: u.id, reglages: { ...REGLAGES_DEFAUT }, phase: "salon", version: 1, diffusee: 1, cree: Date.now(),
    participants: new Map(), manche: 0, volee: 0, compteurVolees: 0, obstacles: [], crateres: [], carte: "semis",
    echeance: 0, transition: 0, tir: null, gagnants: [], minuterie: null, attentes: new Set(),
    rnd: aleatoire(randomInt(2 ** 31)),
  };
  s.participants.set(u.id, nouveau(u.id, u.nom, 0, false));
  salons.set(code, s);
  return code;
}

export function salonsOuverts(): SalonOuvert[] {
  purger();
  const t = Date.now();
  return [...salons.values()]
    .filter((s) => [...s.participants.values()].some((p) => !p.bot && present(p, t)))
    .map((s) => ({
      code: s.code, hote: s.participants.get(s.hote)?.nom ?? "?", phase: s.phase,
      joueurs: [...s.participants.values()].filter((p) => p.bot || present(p, t)).length,
      mode: s.reglages.mode, tir: s.reglages.tir,
    }));
}

/** Entre dans le salon (ou y revient) et signale sa présence. */
function entrer(s: Salon, u: Membre): Participant {
  let p = s.participants.get(u.id);
  if (!p) {
    if (s.participants.size >= PARTICIPANTS_MAX) throw new ErreurSalon("Ce salon est plein");
    p = nouveau(u.id, u.nom, couleurLibre(s), false);
    s.participants.set(u.id, p);
    s.version++;
  }
  const absent = !present(p, Date.now());
  p.vu = Date.now();
  if (absent) s.version++;
  return p;
}

export type Action =
  | { t: "reglages"; reglages: Record<string, unknown> }
  | { t: "bot"; delta: number }
  | { t: "lancer" } | { t: "tirer"; expression: string } | { t: "annuler" }
  | { t: "aider"; id: string } | { t: "conseiller"; expression: string } | { t: "retirerConseil" }
  | { t: "salon" } | { t: "quitter" } | { t: "exclure"; id: string };

export function agir(code: string, u: Membre, a: Action): VueSalon | null {
  const s = trouver(code);
  const moi = entrer(s, u);
  avancer(s);
  const hote = s.hote === u.id;
  const exigerHote = () => { if (!hote) throw new ErreurSalon("Seul l’hôte du salon peut faire ça"); };

  switch (a.t) {
    case "reglages": {
      exigerHote();
      if (s.phase !== "salon") throw new ErreurSalon("Les réglages se changent entre deux parties");
      s.reglages = corrigerReglages(s.reglages, a.reglages ?? {});
      break;
    }
    case "bot": {
      exigerHote();
      if (s.phase !== "salon") throw new ErreurSalon("Les bots s’ajoutent entre deux parties");
      const bots = [...s.participants.values()].filter((p) => p.bot);
      if (a.delta > 0) {
        if (s.participants.size >= JOUEURS_MAX) throw new ErreurSalon(`${JOUEURS_MAX} joueurs au plus`);
        const nom = NOMS_BOTS.find((n) => !bots.some((b) => b.nom === `Bot ${n}`)) ?? `n°${bots.length + 1}`;
        const id = `bot:${nom}`;
        s.participants.set(id, nouveau(id, `Bot ${nom}`, couleurLibre(s), true));
      } else if (bots.length) {
        s.participants.delete(bots[bots.length - 1].id);
      }
      break;
    }
    case "exclure": {
      exigerHote();
      if (s.phase !== "salon" || a.id === u.id) throw new ErreurSalon("Impossible pour l’instant");
      s.participants.delete(String(a.id));
      break;
    }
    case "lancer": {
      exigerHote();
      if (s.phase !== "salon") throw new ErreurSalon("La partie est déjà lancée");
      const t = Date.now();
      for (const [id, p] of s.participants) if (!present(p, t)) s.participants.delete(id);
      const joueurs = [...s.participants.values()].slice(0, JOUEURS_MAX);
      if (joueurs.length < 2) throw new ErreurSalon("Il faut au moins deux joueurs : invite quelqu’un ou ajoute un bot");
      for (const p of s.participants.values()) {
        p.enJeu = joueurs.includes(p);
        p.points = 0; p.eliminations = 0; p.manchesGagnees = 0; p.vivant = false;
      }
      s.manche = 0;
      nouvelleManche(s, t);
      break;
    }
    case "tirer": {
      if (s.phase !== "preparation" || !moi.enJeu || !moi.vivant) throw new ErreurSalon("Ce n’est pas le moment de tirer");
      try {
        moi.expression = verifier(String(a.expression ?? ""), contraintes(s.reglages));
      } catch (err) {
        if (err instanceof ErreurExpression) throw new ErreurSalon(err.message);
        throw err;
      }
      moi.pret = true;
      break;
    }
    case "aider": {
      const cible = s.participants.get(String(a.id));
      if (s.phase !== "preparation" || !moi.enJeu || moi.vivant) throw new ErreurSalon("Seul un joueur éliminé peut en aider un autre");
      if (!cible || cible === moi || !cible.enJeu || !cible.vivant) throw new ErreurSalon("Ce joueur n’est plus en lice");
      moi.conseil = { cible: cible.id, expression: null };
      break;
    }
    case "conseiller": {
      if (s.phase !== "preparation" || !moi.conseil) throw new ErreurSalon("Choisis d’abord un joueur à aider");
      try {
        moi.conseil.expression = verifier(String(a.expression ?? ""), contraintes(s.reglages));
      } catch (err) {
        if (err instanceof ErreurExpression) throw new ErreurSalon(err.message);
        throw err;
      }
      break;
    }
    case "retirerConseil": {
      if (moi.conseil) moi.conseil.expression = null;
      break;
    }
    case "annuler": {
      if (s.phase === "preparation") moi.pret = false;
      break;
    }
    case "salon": {
      exigerHote();
      if (s.phase !== "fin") throw new ErreurSalon("La partie n’est pas finie");
      s.phase = "salon";
      s.tir = null;
      for (const p of s.participants.values()) { p.enJeu = false; p.vivant = false; p.conseil = null; }
      break;
    }
    case "quitter": {
      if (s.phase === "salon" || !moi.enJeu) s.participants.delete(u.id);
      else { moi.vivant = false; moi.vu = 0; }
      // Plus aucun autre humain dans les parages : le salon ferme, bots compris.
      const t = Date.now();
      if (![...s.participants.values()].some((p) => !p.bot && p.id !== u.id && t - p.vu < ABANDON)) {
        fermer(s);
        return null;
      }
      s.version++;
      avancer(s);
      return null;
    }
    default:
      throw new ErreurSalon("Action inconnue");
  }
  s.version++;
  avancer(s);
  return vue(s, moi);
}

/* --- Vues --------------------------------------------------------------- */

/** Ce joueur ne voit-il que ce qu'il a dégagé ? */
function sousVoile(s: Salon, p: Participant): Uint8Array | null {
  if (!p.voile || !p.enJeu) return null;
  if (s.phase === "preparation") return p.vivant ? p.voile : null;
  if (s.phase === "volee") return s.tir?.vivantsAvant.has(p.id) ? p.voile : null;
  return null;
}

function vue(s: Salon, moi: Participant): VueSalon {
  const t = Date.now();
  const voile = sousVoile(s, moi);
  const tir = s.tir;
  return {
    v: s.version, code: s.code, phase: s.phase, hote: s.hote, moi: moi.id, maintenant: t,
    reglages: s.reglages,
    joueurs: [...s.participants.values()].map((p) => {
      const cache = s.phase === "salon" || !p.enJeu
        || (voile !== null && p !== moi && !visible(voile, p.x, p.y));
      return {
        id: p.id, nom: p.nom, couleur: p.couleur, bot: p.bot, enJeu: p.enJeu, vivant: p.vivant,
        pret: p.pret, present: present(p, t), points: p.points, eliminations: p.eliminations,
        manchesGagnees: p.manchesGagnees, x: cache ? null : p.x, y: cache ? null : p.y,
      };
    }),
    manche: s.manche, volee: s.volee, carte: s.carte,
    obstacles: voile ? s.obstacles.filter((c) => cercleVisible(voile, c)) : s.obstacles,
    crateres: s.crateres.map((c, n) => ({ ...c, n })).filter((c) => !voile || cercleVisible(voile, c)),
    echeance: s.phase === "preparation" ? s.echeance : 0,
    monExpression: moi.pret && moi.expression ? moi.expression.source : null,
    monConseil: moi.conseil && s.phase === "preparation"
      ? { cible: moi.conseil.cible, source: moi.conseil.expression?.source ?? null } : null,
    historique: moi.historique,
    voile: voile ? {
      sillages: moi.sillages.filter((x) => s.phase !== "volee" || x.volee < s.volee).map((x) => x.pts),
    } : null,
    tir: tir && s.phase !== "salon" ? {
      n: tir.n, manche: tir.manche, volee: tir.volee,
      tRevelation: tir.tRevelation, tAnimation: tir.tAnimation, tFin: tir.tFin,
      ticks: tir.ticks, expressions: tir.expressions,
      evenements: tir.resultat.evenements.flatMap((e): VueEvenement[] => {
        if (e.type === "impact") return !voile || visible(voile, e.x, e.y) ? [e] : [];
        const vu = !voile || e.victime === moi.id || visible(voile, e.x, e.y);
        return [{ tick: e.tick, type: e.type, tueur: e.tueur, victime: e.victime,
                  x: vu ? e.x : null, y: vu ? e.y : null }];
      }),
      crateresAvant: tir.crateresAvant, vivantsAvant: [...tir.vivantsAvant],
      // Sous le brouillard, une victime hors de vue n'est pas nommée : ce serait la situer.
      conseils: tir.conseils.map((c) => ({
        id: c.id, cible: c.cible, source: c.source,
        touches: c.touches.filter((h) => !voile || h.victime === moi.id || visible(voile, h.x, h.y))
          .map((h) => ({ victime: h.victime, tick: h.tick })),
      })),
    } : null,
    transition: s.phase === "finManche" ? s.transition : 0,
    gagnants: s.phase === "finManche" || s.phase === "fin" ? s.gagnants : [],
  };
}

/** État du salon pour ce membre ; il y entre s'il n'y était pas. */
export function lireSalon(code: string, u: Membre): VueSalon {
  const s = trouver(code);
  const moi = entrer(s, u);
  avancer(s);
  return vue(s, moi);
}

export function versionSalon(code: string): number | null {
  return salons.get(code)?.version ?? null;
}

/** Courbes de la dernière volée, découpées selon ce que ce joueur a le droit de voir. */
export function lireTraces(code: string, u: Membre): VueTraces | null {
  const s = trouver(code);
  const moi = s.participants.get(u.id);
  if (!moi || !s.tir || s.phase === "salon") return null;
  const voile = sousVoile(s, moi);
  const traces: VueTrace[] = [];
  const toutes = [
    ...s.tir.resultat.traces.map((tr) => ({ tr, conseil: undefined as string | undefined })),
    ...s.tir.conseils.flatMap((c) => c.traces.map((tr) => ({ tr, conseil: c.id }))),
  ];
  for (const { tr, conseil } of toutes) {
    if (!voile || (tr.joueur === moi.id && !conseil)) {
      traces.push({ joueur: tr.joueur, dir: tr.dir, debut: 0, pts: tr.pts, fin: tr.fin, conseil });
      continue;
    }
    // Courbe adverse sous le brouillard : seuls les morceaux qui passent dans mes couloirs.
    let morceau: VueTrace | null = null;
    for (let i = 0; i < tr.pts.length; i += 2) {
      if (visible(voile, tr.pts[i], tr.pts[i + 1])) {
        if (!morceau) traces.push(morceau = { joueur: tr.joueur, dir: tr.dir, debut: i / 2, pts: [], fin: null, conseil });
        morceau.pts.push(tr.pts[i], tr.pts[i + 1]);
      } else morceau = null;
    }
  }
  return { n: s.tir.n, traces };
}
