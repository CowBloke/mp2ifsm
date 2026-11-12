/*
 * Curve Fight : les sons. Des bruitages CC0 (public/courbes/sons, voir
 * CREDITS.md) joués par Web Audio, avec un repli synthétisé tant qu'ils
 * ne sont pas chargés. Le contexte audio n'est créé qu'après un geste du
 * joueur, comme l'exigent les navigateurs ; le réglage muet est gardé
 * sur l'appareil. Tout passe par un compresseur : dix éliminations à la
 * fois ne saturent pas.
 */
const CLE = "curve-fight-son";
const FICHIERS = [
  "lancement", "revelation", "tic", "pret", "impact", "elimination", "explosion-epique",
  "ralenti", "tir-ami", "gong", "victoire",
] as const;
type Nom = (typeof FICHIERS)[number];

let ctx: AudioContext | null = null;
let sortie: AudioNode | null = null;
let chargement: Promise<void> | null = null;
const tampons = new Map<Nom, AudioBuffer>();
const derniers = new Map<string, number>();

export function sonActif(): boolean {
  try { return localStorage.getItem(CLE) !== "0"; } catch { return true; }
}
export function reglerSon(actif: boolean): void {
  try { localStorage.setItem(CLE, actif ? "1" : "0"); } catch { /* stockage refusé */ }
  if (actif) reveiller();
}

/** À appeler sur un clic : débloque le son pour la suite et charge les bruitages. */
export function reveiller(): void {
  try {
    // Safari d'avant la version 14.1 ne connaît que le nom préfixé.
    const Contexte = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Contexte) return;
    if (!ctx) {
      ctx = new Contexte();
      const compresseur = ctx.createDynamicsCompressor();
      compresseur.threshold.value = -14; compresseur.knee.value = 10; compresseur.ratio.value = 6;
      compresseur.attack.value = 0.003; compresseur.release.value = 0.2;
      const volume = ctx.createGain();
      volume.gain.value = 0.8;
      compresseur.connect(volume).connect(ctx.destination);
      sortie = compresseur;
    }
    if (ctx.state === "suspended") void ctx.resume();
    charger();
  } catch { /* pas de son sur cet appareil */ }
}

function charger(): void {
  if (chargement || !ctx) return;
  const c = ctx;
  chargement = Promise.all(FICHIERS.map(async (nom) => {
    try {
      const r = await fetch(`/courbes/sons/${nom}.mp3`);
      if (!r.ok) return;
      const donnees = await r.arrayBuffer();
      // La forme à rappels marche aussi sur les vieux Safari.
      const tampon = await new Promise<AudioBuffer>((ok, ko) => c.decodeAudioData(donnees, ok, ko));
      tampons.set(nom, tampon);
    } catch { /* ce son restera synthétisé */ }
  })).then(() => undefined);
}

const pret = () => !!ctx && !!sortie && ctx.state === "running" && sonActif();

/** Pas deux fois le même son à moins de `ecart` ms (vingt impacts à la fois ne font qu'un). */
function espace(cle: string, ecart: number): boolean {
  const t = performance.now();
  if (t - (derniers.get(cle) ?? -Infinity) < ecart) return false;
  derniers.set(cle, t);
  return true;
}

type Jeu = { volume?: number; vitesse?: number; retard?: number };

/** Joue un bruitage ; faux s'il n'est pas (encore) chargé. */
function jouer(nom: Nom, { volume = 1, vitesse = 1, retard = 0 }: Jeu = {}): boolean {
  const tampon = tampons.get(nom);
  if (!pret() || !tampon) return false;
  const t = ctx!.currentTime + retard;
  const source = ctx!.createBufferSource(), gain = ctx!.createGain();
  source.buffer = tampon;
  source.playbackRate.value = vitesse;
  gain.gain.value = volume;
  source.connect(gain).connect(sortie!);
  source.start(t);
  return true;
}

function note(frequence: number, duree: number, type: OscillatorType, volume: number, glisse = 0, retard = 0): void {
  if (!pret()) return;
  const t = ctx!.currentTime + retard;
  const osc = ctx!.createOscillator(), gain = ctx!.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequence, t);
  if (glisse) osc.frequency.exponentialRampToValueAtTime(Math.max(30, frequence + glisse), t + duree);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  osc.connect(gain).connect(sortie!);
  osc.start(t);
  osc.stop(t + duree);
}

/** Coup sourd sous les explosions : ce qui fait trembler. */
const grave = (force: number) => note(70, 0.35 + 0.15 * force, "sine", 0.25 + 0.08 * force, -35);

export const sons = {
  decompte: () => jouer("tic", { volume: 0.55 }) || note(520, 0.09, "square", 0.04),
  revelation: () => jouer("revelation", { volume: 0.6 }) || note(440, 0.25, "triangle", 0.05, 220),
  depart: () => {
    if (!jouer("lancement", { volume: 0.8 })) { note(300, 0.5, "sawtooth", 0.05, 600); note(150, 0.5, "sine", 0.08, 200); }
  },
  /** Une courbe s'écrase sur un obstacle ; plus grave au ralenti. */
  impact: (ralenti = 1) => {
    if (!espace("impact", 45)) return;
    const vitesse = (0.88 + Math.random() * 0.24) * (0.6 + 0.4 * ralenti);
    if (!jouer("impact", { volume: 0.55, vitesse })) note(140, 0.18, "triangle", 0.09, -90);
  },
  /** force : 1 élimination, 2 coup double ou tir ami, 3 le coup qui finit la manche. */
  elimination: (force = 1, tirAmi = false) => {
    if (!espace("elimination", 60)) return;
    const vitesse = 1 - 0.12 * (force - 1);
    if (!jouer("elimination", { volume: 0.9, vitesse })) {
      note(620, 0.35, "sawtooth", 0.08, -540); note(90, 0.4, "square", 0.07, -50);
    }
    if (force >= 2) jouer("explosion-epique", { volume: 0.5 + 0.2 * force, vitesse: force >= 3 ? 0.78 : 0.92, retard: 0.04 });
    if (tirAmi) jouer("tir-ami", { volume: 0.8, retard: 0.12 });
    grave(force);
  },
  /** Le temps ralentit : un souffle qui descend. */
  ralenti: (force = 1) => jouer("ralenti", { volume: 0.35 + 0.15 * force, vitesse: 1 - 0.1 * force }) || note(400, 0.6, "sine", 0.05, -300),
  pret: () => jouer("pret", { volume: 0.7 }) || note(880, 0.08, "sine", 0.05, 300),
  finManche: () => jouer("gong", { volume: 0.5 }),
  victoire: () => {
    if (jouer("victoire", { volume: 0.8 })) { jouer("gong", { volume: 0.35, retard: 0.25 }); return; }
    [523, 659, 784, 1047].forEach((f, i) => note(f, 0.22, "triangle", 0.07, 0, i * 0.12));
  },
};
