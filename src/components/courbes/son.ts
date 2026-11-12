/*
 * Curve Fight : quelques sons synthétisés (aucun fichier). Le contexte
 * audio n'est créé qu'après un geste du joueur, comme l'exigent les
 * navigateurs ; le réglage muet est gardé sur l'appareil.
 */
const CLE = "curve-fight-son";
let ctx: AudioContext | null = null;

export function sonActif(): boolean {
  try { return localStorage.getItem(CLE) !== "0"; } catch { return true; }
}
export function reglerSon(actif: boolean): void {
  try { localStorage.setItem(CLE, actif ? "1" : "0"); } catch { /* stockage refusé */ }
  if (actif) reveiller();
}

/** À appeler sur un clic : débloque le son pour la suite. */
export function reveiller(): void {
  try {
    // Safari d'avant la version 14.1 ne connaît que le nom préfixé.
    const Contexte = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Contexte) return;
    ctx ??= new Contexte();
    if (ctx.state === "suspended") void ctx.resume();
  } catch { /* pas de son sur cet appareil */ }
}

function note(frequence: number, duree: number, type: OscillatorType, volume: number, glisse = 0): void {
  if (!ctx || ctx.state !== "running" || !sonActif()) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequence, t);
  if (glisse) osc.frequency.exponentialRampToValueAtTime(Math.max(30, frequence + glisse), t + duree);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duree);
}

export const sons = {
  decompte: () => note(520, 0.09, "square", 0.04),
  depart: () => { note(300, 0.5, "sawtooth", 0.05, 600); note(150, 0.5, "sine", 0.08, 200); },
  impact: () => note(140, 0.18, "triangle", 0.09, -90),
  elimination: () => { note(620, 0.35, "sawtooth", 0.08, -540); note(90, 0.4, "square", 0.07, -50); },
  pret: () => note(880, 0.08, "sine", 0.05, 300),
  victoire: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => note(f, 0.22, "triangle", 0.07), i * 120)),
};
