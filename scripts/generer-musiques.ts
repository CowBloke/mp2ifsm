/*
 * Génère la bibliothèque de musiques des vidéos (public/musique/*.m4a).
 * Tout est synthétisé ici (oscillateurs, enveloppes, bruit) : aucune
 * œuvre tierce, donc aucun droit à gérer. Chaque piste est une boucle
 * d'un nombre entier de mesures, bouclable sans couture (la traîne des
 * notes est repliée sur le début).
 *
 *   node --experimental-strip-types scripts/generer-musiques.ts
 *
 * Il faut ffmpeg pour l'encodage AAC. Le résultat est déterministe.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const SR = 44100;
const DOSSIER = join(process.cwd(), "public/musique");

/* Bruit pseudo-aléatoire reproductible. */
function graine(s: number) {
  let x = s >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 0xffffffff * 2 - 1; };
}

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const NOTES: Record<string, number> = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
/** "A3" → 57 */
function n(nom: string): number {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(nom);
  if (!m) throw new Error(nom);
  return NOTES[m[1]] + (Number(m[2]) + 1) * 12;
}
const accord = (s: string) => s.split(" ").map(n);

type Piste = { L: Float32Array; R: Float32Array; longueur: number };

function piste(secondes: number): Piste {
  const longueur = Math.round(secondes * SR);
  // Marge pour la traîne, repliée sur le début à la fin.
  return { L: new Float32Array(longueur + SR * 4), R: new Float32Array(longueur + SR * 4), longueur };
}

type Onde = "sinus" | "triangle" | "carre" | "scie";
function onde(type: Onde, phase: number): number {
  const p = phase - Math.floor(phase);
  switch (type) {
    case "sinus": return Math.sin(2 * Math.PI * p);
    case "triangle": return 1 - 4 * Math.abs(p - 0.5);
    case "carre": return p < 0.5 ? 0.8 : -0.8;
    case "scie": return 2 * p - 1;
  }
}

type Note = {
  t: number; duree: number; freq: number; gain: number; pan?: number;
  type: Onde; attaque?: number; declin?: number; maintien?: number; relache?: number;
  desaccord?: number; filtre?: number; harmoniques?: number[]; vibrato?: number;
};

/* Une note avec enveloppe ADSR, filtre passe-bas à un pôle facultatif. */
function jouer(p: Piste, x: Note) {
  const a = x.attaque ?? 0.005, d = x.declin ?? 0.1, s = x.maintien ?? 0.7, r = x.relache ?? 0.1;
  const debut = Math.round(x.t * SR);
  const fin = Math.round((x.t + x.duree + r) * SR);
  const pan = x.pan ?? 0;
  const gL = x.gain * Math.cos((pan + 1) * Math.PI / 4), gR = x.gain * Math.sin((pan + 1) * Math.PI / 4);
  const voix = x.desaccord ? [-x.desaccord, 0, x.desaccord] : [0];
  const coef = x.filtre ? 1 - Math.exp(-2 * Math.PI * x.filtre / SR) : 1;
  let y = 0;
  for (let i = debut; i < fin && i < p.L.length; i++) {
    const t = (i - debut) / SR;
    let env: number;
    if (t < a) env = t / a;
    else if (t < a + d) env = 1 - (1 - s) * ((t - a) / d);
    else if (t < x.duree) env = s;
    else env = s * Math.max(0, 1 - (t - x.duree) / r);
    const vib = x.vibrato ? 1 + 0.004 * Math.sin(2 * Math.PI * 5 * t) * Math.min(1, t / 0.3) : 1;
    let v = 0;
    for (const c of voix) {
      const f = x.freq * vib * 2 ** (c / 1200);
      if (x.harmoniques) x.harmoniques.forEach((h, k) => { v += h * Math.sin(2 * Math.PI * f * (k + 1) * t) * Math.exp(-t * k * 0.9); });
      else v += onde(x.type, f * t);
    }
    v /= voix.length;
    y += coef * (v - y);
    p.L[i] += y * env * gL;
    p.R[i] += y * env * gR;
  }
}

function grosseCaisse(p: Piste, t: number, gain = 0.9) {
  const debut = Math.round(t * SR);
  let phase = 0;
  for (let i = 0; i < SR * 0.4; i++) {
    const s = i / SR;
    const f = 45 + 110 * Math.exp(-s * 28);
    phase += f / SR;
    const v = Math.sin(2 * Math.PI * phase) * Math.exp(-s * 9) * gain + (i < 60 ? 0.3 * (1 - i / 60) * gain : 0);
    p.L[debut + i] += v; p.R[debut + i] += v;
  }
}

function caisseClaire(p: Piste, t: number, gain = 0.45, bruit = graine(7)) {
  const debut = Math.round(t * SR);
  let y = 0;
  for (let i = 0; i < SR * 0.25; i++) {
    const s = i / SR;
    const b = bruit();
    y += 0.55 * (b - y);
    const v = (b - y) * Math.exp(-s * 18) * gain + Math.sin(2 * Math.PI * 190 * s) * Math.exp(-s * 30) * gain * 0.5;
    p.L[debut + i] += v; p.R[debut + i] += v;
  }
}

function charleston(p: Piste, t: number, gain = 0.12, ouvert = false, bruit = graine(11)) {
  const debut = Math.round(t * SR);
  let prec = 0;
  const duree = ouvert ? 0.22 : 0.05;
  for (let i = 0; i < SR * duree; i++) {
    const s = i / SR;
    const b = bruit();
    const hp = b - prec; prec = b;
    const v = hp * Math.exp(-s * (ouvert ? 14 : 70)) * gain;
    p.L[debut + i] += v * 0.8; p.R[debut + i] += v;
  }
}

/* Craquement de vinyle très discret (lo-fi). */
function vinyle(p: Piste, gain: number) {
  const r = graine(99);
  for (let i = 0; i < p.longueur; i++) {
    const b = r() * gain * 0.08;
    const pop = Math.abs(r()) > 0.9996 ? r() * gain : 0;
    p.L[i] += b + pop; p.R[i] += b + pop;
  }
}

/* Écho stéréo simple (ping-pong) sur un bus séparé. */
function echo(src: Piste, dst: Piste, delai: number, retour: number, mix: number) {
  const d = Math.round(delai * SR);
  const L = new Float32Array(src.L), R = new Float32Array(src.R);
  for (let i = d; i < L.length; i++) { L[i] += R[i - d] * retour; R[i] += L[i - d] * retour; }
  for (let i = 0; i < L.length; i++) {
    dst.L[i] += src.L[i] + (L[i] - src.L[i]) * mix;
    dst.R[i] += src.R[i] + (R[i] - src.R[i]) * mix;
  }
}

function boucler(p: Piste): [Float32Array, Float32Array] {
  const L = p.L.slice(0, p.longueur), R = p.R.slice(0, p.longueur);
  for (let i = p.longueur; i < p.L.length; i++) { L[i % p.longueur] += p.L[i]; R[i % p.longueur] += p.R[i]; }
  // Saturation douce puis normalisation à −1 dBFS.
  let max = 0;
  for (let i = 0; i < L.length; i++) {
    L[i] = Math.tanh(L[i] * 1.1); R[i] = Math.tanh(R[i] * 1.1);
    max = Math.max(max, Math.abs(L[i]), Math.abs(R[i]));
  }
  const g = 0.89 / (max || 1);
  for (let i = 0; i < L.length; i++) { L[i] *= g; R[i] *= g; }
  return [L, R];
}

function wav([L, R]: [Float32Array, Float32Array]): Buffer {
  const b = Buffer.alloc(44 + L.length * 4);
  b.write("RIFF", 0); b.writeUInt32LE(36 + L.length * 4, 4); b.write("WAVE", 8);
  b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(L.length * 4, 40);
  for (let i = 0; i < L.length; i++) {
    b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4);
    b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4);
  }
  return b;
}

/* --- Les morceaux ---------------------------------------------------- */

type Morceau = { cle: string; bpm: number; mesures: number; composer: (p: Piste, temps: number) => void };

const MORCEAUX: Morceau[] = [
  {
    // Lo-fi : piano électrique jazzy, rythme chaloupé, vinyle.
    cle: "lofi", bpm: 78, mesures: 16,
    composer(p, b) {
      const grille = ["A2 G3 C4 E4", "D2 F3 A3 C4", "G2 F3 B3 D4", "C2 E3 G3 B3"].map(accord);
      const melodie = [n("E5"), n("D5"), n("C5"), n("A4"), n("G4"), n("A4"), n("C5"), n("B4")];
      const notes = piste(p.longueur / SR);
      for (let m = 0; m < 16; m++) {
        const t0 = m * 4 * b;
        const [basse, ...haut] = grille[m % 4];
        haut.forEach((x, k) => jouer(notes, { t: t0 + k * 0.02, duree: 3.6 * b, freq: hz(x), gain: 0.11, type: "sinus",
          harmoniques: [1, 0.35, 0.12, 0.05], attaque: 0.01, declin: 1.2, maintien: 0.35, relache: 0.6, pan: -0.3 + k * 0.3 }));
        jouer(notes, { t: t0, duree: 1.6 * b, freq: hz(basse), gain: 0.32, type: "sinus", filtre: 300, declin: 0.4, maintien: 0.6, relache: 0.15 });
        jouer(notes, { t: t0 + 2.5 * b, duree: 1.2 * b, freq: hz(basse + 7), gain: 0.22, type: "sinus", filtre: 300, relache: 0.15 });
        if (m >= 4 && m % 2 === 0) {
          for (let k = 0; k < 4; k++) {
            const x = melodie[(m + k * 3) % melodie.length];
            jouer(notes, { t: t0 + (k * 1 + (k % 2 ? 0.66 : 0)) * b, duree: 0.45 * b, freq: hz(x), gain: 0.07, type: "triangle",
              filtre: 2200, declin: 0.3, maintien: 0.3, relache: 0.4, pan: 0.25 });
          }
        }
        for (let k = 0; k < 4; k++) {
          const t = t0 + k * b;
          if (k === 0 || k === 2) grosseCaisse(p, t, 0.55);
          if (k === 2 && m % 2) grosseCaisse(p, t + 0.75 * b, 0.35);
          if (k === 1 || k === 3) caisseClaire(p, t, 0.22);
          charleston(p, t, 0.05);
          charleston(p, t + 0.66 * b, 0.035);
        }
      }
      echo(notes, p, 0.66 * b, 0.35, 0.35);
      vinyle(p, 0.25);
    },
  },
  {
    // Chiptune : arpèges en carré, basse triangle, batterie 8 bits.
    cle: "chiptune", bpm: 140, mesures: 16,
    composer(p, b) {
      const grille = ["C4 E4 G4", "G3 B3 D4", "A3 C4 E4", "F3 A3 C4"].map(accord);
      const theme = [0, 2, 4, 7, 9, 7, 4, 2];
      const gamme = [n("C5"), n("D5"), n("E5"), n("F5"), n("G5"), n("A5"), n("B5"), n("C6"), n("D6"), n("E6")];
      for (let m = 0; m < 16; m++) {
        const t0 = m * 4 * b;
        const acc = grille[m % 4];
        for (let k = 0; k < 16; k++) {
          jouer(p, { t: t0 + k * b / 4, duree: b / 5, freq: hz(acc[k % 3] + (k % 6 >= 3 ? 12 : 0)), gain: 0.06, type: "carre",
            declin: 0.05, maintien: 0.5, relache: 0.02, pan: -0.2 });
        }
        for (let k = 0; k < 8; k++) {
          jouer(p, { t: t0 + k * b / 2, duree: b / 2.4, freq: hz(acc[0] - 12 - (k % 2 ? 0 : 12)), gain: 0.22, type: "triangle", relache: 0.02 });
        }
        if (m >= 4) {
          for (let k = 0; k < 8; k++) {
            if ((m + k) % 3 === 2) continue;
            const deg = theme[(k + Math.floor(m / 2)) % theme.length] % gamme.length;
            jouer(p, { t: t0 + k * b / 2, duree: b / 2.4, freq: hz(gamme[deg]), gain: 0.07, type: "carre",
              declin: 0.1, maintien: 0.6, relache: 0.04, vibrato: 1, pan: 0.25 });
          }
        }
        for (let k = 0; k < 4; k++) {
          const t = t0 + k * b;
          grosseCaisse(p, t, k % 2 ? 0.0 : 0.7);
          if (k % 2) caisseClaire(p, t, 0.3);
          charleston(p, t + b / 2, 0.08);
        }
      }
    },
  },
  {
    // Synthwave : nappes en dents de scie, basse en croches, batterie large.
    cle: "synthwave", bpm: 100, mesures: 16,
    composer(p, b) {
      const grille = ["A3 C4 E4", "F3 A3 C4", "C4 E4 G4", "G3 B3 D4"].map(accord);
      const basses = [n("A1"), n("F1"), n("C2"), n("G1")];
      const nappe = piste(p.longueur / SR);
      for (let m = 0; m < 16; m++) {
        const t0 = m * 4 * b;
        grille[m % 4].forEach((x, k) => jouer(nappe, { t: t0, duree: 4 * b, freq: hz(x), gain: 0.07, type: "scie", desaccord: 12,
          filtre: 1400, attaque: 0.4, declin: 0.5, maintien: 0.8, relache: 0.5, pan: -0.4 + k * 0.4 }));
        for (let k = 0; k < 8; k++) {
          jouer(p, { t: t0 + k * b / 2, duree: b / 2.5, freq: hz(basses[m % 4] + (k % 2 ? 12 : 0)), gain: 0.2, type: "scie", filtre: 500, relache: 0.03 });
        }
        if (m >= 8) {
          const arp = grille[m % 4];
          for (let k = 0; k < 8; k++) jouer(nappe, { t: t0 + k * b / 2, duree: b / 3, freq: hz(arp[k % 3] + 12), gain: 0.05, type: "carre", filtre: 2500, relache: 0.1, pan: k % 2 ? 0.5 : -0.5 });
        }
        for (let k = 0; k < 4; k++) {
          const t = t0 + k * b;
          grosseCaisse(p, t, k % 2 ? 0.4 : 0.8);
          if (k % 2) caisseClaire(p, t, 0.4);
          charleston(p, t + b / 2, 0.07);
          charleston(p, t, 0.04);
        }
      }
      echo(nappe, p, 0.75 * b, 0.4, 0.4);
    },
  },
  {
    // Piano calme : arpèges lents, pas de batterie.
    cle: "piano", bpm: 72, mesures: 16,
    composer(p, b) {
      const grille = ["F2 C3 F3 A3 C4", "E2 C3 E3 G3 C4", "D2 A2 D3 F3 A3", "Bb1 F2 Bb2 D3 F3"].map(accord);
      const chant = [n("A4"), n("G4"), n("F4"), n("E4"), n("D4"), n("C4"), n("D4"), n("F4")];
      const notes = piste(p.longueur / SR);
      for (let m = 0; m < 16; m++) {
        const t0 = m * 4 * b;
        const acc = grille[m % 4];
        const ordre = [0, 1, 2, 3, 4, 3, 2, 1];
        ordre.forEach((k, j) => jouer(notes, { t: t0 + j * b / 2, duree: 1.4 * b, freq: hz(acc[k]), gain: k === 0 ? 0.2 : 0.11, type: "sinus",
          harmoniques: [1, 0.5, 0.25, 0.12, 0.06], attaque: 0.004, declin: 1.6, maintien: 0.15, relache: 0.9, pan: -0.35 + k * 0.17 }));
        if (m >= 4) {
          jouer(notes, { t: t0 + 0.5 * b, duree: 1.4 * b, freq: hz(chant[m % 8] + 12), gain: 0.09, type: "sinus",
            harmoniques: [1, 0.4, 0.15], declin: 1.5, maintien: 0.2, relache: 1.2, pan: 0.2 });
          jouer(notes, { t: t0 + 2.5 * b, duree: 1.2 * b, freq: hz(chant[(m + 3) % 8] + 12), gain: 0.07, type: "sinus",
            harmoniques: [1, 0.4, 0.15], declin: 1.5, maintien: 0.2, relache: 1.2, pan: 0.2 });
        }
      }
      echo(notes, p, 0.5 * b, 0.45, 0.45);
    },
  },
  {
    // Énergie : house à quatre temps, accords syncopés, charleston ouvert.
    cle: "energie", bpm: 124, mesures: 16,
    composer(p, b) {
      const grille = ["F3 Ab3 C4 Eb4", "Db3 F3 Ab3 C4", "Ab3 C4 Eb4 G4", "Eb3 G3 Bb3 Db4"].map(accord);
      const basses = [n("F1"), n("Db2"), n("Ab1"), n("Eb2")];
      const accords = piste(p.longueur / SR);
      for (let m = 0; m < 16; m++) {
        const t0 = m * 4 * b;
        for (const pos of [0.5, 1.75, 2.5, 3.75]) {
          grille[m % 4].forEach((x, k) => jouer(accords, { t: t0 + pos * b, duree: b / 4, freq: hz(x), gain: 0.06, type: "scie", desaccord: 8,
            filtre: 1800, declin: 0.12, maintien: 0.4, relache: 0.08, pan: -0.3 + k * 0.2 }));
        }
        for (let k = 0; k < 4; k++) {
          jouer(p, { t: t0 + (k + 0.5) * b, duree: b / 3, freq: hz(basses[m % 4]), gain: 0.3, type: "sinus", filtre: 400, relache: 0.04 });
          const t = t0 + k * b;
          grosseCaisse(p, t, 0.9);
          if (k % 2) caisseClaire(p, t, 0.32);
          charleston(p, t + b / 2, 0.1, true);
          if (m >= 4) { charleston(p, t + b / 4, 0.04); charleston(p, t + 3 * b / 4, 0.04); }
        }
      }
      echo(accords, p, 0.75 * b, 0.3, 0.3);
    },
  },
];

mkdirSync(DOSSIER, { recursive: true });
const tmp = join(tmpdir(), `mp2-musique-${process.pid}`);
mkdirSync(tmp, { recursive: true });
try {
  for (const m of MORCEAUX) {
    const temps = 60 / m.bpm;
    const p = piste(m.mesures * 4 * temps);
    m.composer(p, temps);
    const fichier = join(tmp, `${m.cle}.wav`);
    writeFileSync(fichier, wav(boucler(p)));
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", fichier,
      "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", join(DOSSIER, `${m.cle}.m4a`)]);
    console.log(`${m.cle}.m4a`, (m.mesures * 4 * temps).toFixed(2), "s");
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
