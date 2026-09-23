import { JAUGE_MAX } from "../../noyau/coups";
import { SOUS_PIXELS, TICKS_PAR_SECONDE } from "../../noyau/constantes";
import type { Evenement } from "../../noyau/evenements";
import type { Monde } from "../../noyau/monde";

/*
 * Sons du jeu, synthétisés à la volée (Web Audio) : aucun fichier à
 * télécharger, aucune licence. Chaque son est une courte recette — bruit
 * filtré, tons qui glissent, enveloppes — choisie d'après les événements
 * de la simulation et les DONNÉES du coup ou de l'entité (jamais d'après
 * le nom d'un personnage). La position à l'écran règle le panoramique ;
 * hors champ, le son s'atténue.
 */

export type Ecoute = {
  /** Centre de la caméra, en pixels du monde. */
  x: number;
  /** Demi-largeur de la vue, en pixels du monde. */
  demiLargeur: number;
};

export type Sons = {
  maj(monde: Monde, evenements: readonly Evenement[], ecoute: Ecoute, local: number): void;
  volume(v: number): void;
  detruire(): void;
};

const MUET: Sons = { maj() {}, volume() {}, detruire() {} };
/** Au-delà, les nouveaux sons attendent qu'une voix se libère : la bouillie n'aide personne. */
const VOIX_MAX = 36;

type Onde = OscillatorType;
type Bruit = { duree: number; freq: number; freqFin?: number; q?: number; filtre?: BiquadFilterType; gain: number; attaque?: number; delai?: number };
type Ton = { duree: number; freq: number; freqFin?: number; onde?: Onde; gain: number; attaque?: number; delai?: number };

export function creerSons(): Sons {
  const Contexte = typeof window === "undefined" ? undefined
    : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Contexte) return MUET;
  let ctx: AudioContext;
  try {
    ctx = new Contexte();
  } catch {
    return MUET;
  }

  const maitre = ctx.createGain();
  const compresseur = ctx.createDynamicsCompressor();
  compresseur.threshold.value = -16;
  compresseur.knee.value = 12;
  compresseur.ratio.value = 5;
  maitre.connect(compresseur).connect(ctx.destination);
  let niveau = 0.7;
  maitre.gain.value = niveau * niveau;

  // Une seconde de bruit blanc, partagée par toutes les recettes.
  const blanc = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const donnees = blanc.getChannelData(0);
  for (let i = 0; i < donnees.length; i++) donnees[i] = Math.random() * 2 - 1;

  // Les navigateurs n'autorisent le son qu'après un geste de l'utilisateur.
  const debloquer = () => {
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  };
  window.addEventListener("pointerdown", debloquer);
  window.addEventListener("keydown", debloquer);
  debloquer();

  let voix = 0;
  const fin = () => {
    voix--;
  };

  /** Point de sortie d'un son : panoramique et volume selon la position. */
  function voie(x: number | null, ecoute: Ecoute, gain = 1): AudioNode | null {
    if (ctx.state !== "running" || niveau === 0 || voix >= VOIX_MAX) return null;
    const g = ctx.createGain();
    let pan = 0;
    if (x !== null && ecoute.demiLargeur > 0) {
      const dx = x - ecoute.x;
      pan = Math.max(-1, Math.min(1, dx / ecoute.demiLargeur)) * 0.65;
      gain /= 1 + Math.max(0, Math.abs(dx) - ecoute.demiLargeur) / ecoute.demiLargeur;
    }
    g.gain.value = gain;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(maitre);
    } else {
      g.connect(maitre);
    }
    return g;
  }

  function enveloppe(g: GainNode, t: number, gain: number, attaque: number, duree: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attaque);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(duree, attaque + 0.01));
  }

  function bruit(sortie: AudioNode, b: Bruit) {
    const t = ctx.currentTime + 0.004 + (b.delai ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = blanc;
    const f = ctx.createBiquadFilter();
    f.type = b.filtre ?? "bandpass";
    f.Q.value = b.q ?? 1;
    f.frequency.setValueAtTime(b.freq, t);
    if (b.freqFin) f.frequency.exponentialRampToValueAtTime(b.freqFin, t + b.duree);
    const g = ctx.createGain();
    enveloppe(g, t, b.gain, b.attaque ?? 0.003, b.duree);
    src.connect(f).connect(g).connect(sortie);
    voix++;
    src.onended = fin;
    src.start(t, Math.random() * 0.4);
    src.stop(t + b.duree + 0.03);
  }

  function ton(sortie: AudioNode, o: Ton) {
    const t = ctx.currentTime + 0.004 + (o.delai ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.onde ?? "sine";
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.freqFin) osc.frequency.exponentialRampToValueAtTime(o.freqFin, t + o.duree);
    const g = ctx.createGain();
    enveloppe(g, t, o.gain, o.attaque ?? 0.005, o.duree);
    osc.connect(g).connect(sortie);
    voix++;
    osc.onended = fin;
    osc.start(t);
    osc.stop(t + o.duree + 0.03);
  }

  // --- Recettes -------------------------------------------------------------

  function impact(s: AudioNode, degats: number) {
    const f = Math.min(1, degats / 140);
    bruit(s, { duree: 0.07 + 0.14 * f, freq: 700 + 2600 * f, freqFin: 300, filtre: "lowpass", q: 0.7, gain: 0.35 + 0.35 * f });
    ton(s, { duree: 0.1 + 0.2 * f, freq: 170, freqFin: 45, gain: 0.25 + 0.5 * f });
    if (degats >= 90) bruit(s, { duree: 0.05, freq: 3200, filtre: "highpass", gain: 0.22 });
  }

  function explosion(s: AudioNode, force: number) {
    bruit(s, { duree: 0.45 * force + 0.15, freq: 900, freqFin: 110, filtre: "lowpass", q: 0.8, gain: 0.5 * force + 0.1, attaque: 0.01 });
    ton(s, { duree: 0.4 * force + 0.1, freq: 95, freqFin: 32, gain: 0.55 * force });
  }

  function arpege(s: AudioNode, notes: readonly number[], pas: number, onde: Onde, gain: number, tenue = 0.14) {
    notes.forEach((freq, i) => ton(s, { freq, duree: i === notes.length - 1 ? tenue * 4 : tenue, onde, gain, delai: i * pas, attaque: 0.01 }));
  }

  const jaugesPleines = new Set<number>();
  let numeroDecompte = -1;
  let secondeChrono = -1;

  return {
    maj(monde, evenements, ecoute, local) {
      if (ctx.state !== "running" || niveau === 0) return;
      const ici = (x: number) => x / SOUS_PIXELS;

      for (const e of evenements) {
        switch (e.type) {
          case "touche": {
            const s = voie(ici(e.x), ecoute);
            if (s) impact(s, e.valeur);
            break;
          }
          case "armure": {
            const s = voie(ici(e.x), ecoute, 0.8);
            if (!s) break;
            ton(s, { duree: 0.2, freq: 520, freqFin: 470, onde: "triangle", gain: 0.3 });
            ton(s, { duree: 0.07, freq: 1040, onde: "square", gain: 0.06 });
            bruit(s, { duree: 0.05, freq: 3000, filtre: "highpass", gain: 0.15 });
            break;
          }
          case "contre": {
            const s = voie(ici(e.x), ecoute);
            if (!s) break;
            ton(s, { duree: 0.3, freq: 1320, gain: 0.28 });
            ton(s, { duree: 0.22, freq: 1980, gain: 0.16, delai: 0.02 });
            bruit(s, { duree: 0.05, freq: 4000, filtre: "highpass", gain: 0.2 });
            break;
          }
          case "ko": {
            const s = voie(ici(e.x), ecoute, 1.1);
            if (!s) break;
            explosion(s, 1);
            bruit(s, { duree: 0.5, freq: 600, freqFin: 90, filtre: "lowpass", gain: 0.35, delai: 0.09 });
            break;
          }
          case "chute": {
            const s = voie(ici(e.x), ecoute, 0.9);
            if (!s) break;
            bruit(s, { duree: 0.55, freq: 1600, freqFin: 180, q: 1.5, gain: 0.25, attaque: 0.02 });
            ton(s, { duree: 0.5, freq: 720, freqFin: 110, onde: "triangle", gain: 0.14 });
            break;
          }
          case "saut": {
            const s = voie(ici(e.x), ecoute, 0.6);
            if (s) ton(s, e.valeur === 0 ? { duree: 0.09, freq: 260, freqFin: 520, gain: 0.12 } : { duree: 0.1, freq: 360, freqFin: 760, gain: 0.1 });
            break;
          }
          case "dash": {
            const s = voie(ici(e.x), ecoute, 0.7);
            if (s) bruit(s, { duree: 0.14, freq: 800, freqFin: 2600, q: 0.9, gain: 0.2, attaque: 0.01 });
            break;
          }
          case "atterrissage": {
            if (e.valeur < 1500) break;
            const s = voie(ici(e.x), ecoute, 0.6);
            if (!s) break;
            bruit(s, { duree: 0.08, freq: 320, filtre: "lowpass", gain: Math.min(0.3, e.valeur / 7000) });
            ton(s, { duree: 0.07, freq: 95, freqFin: 50, gain: 0.14 });
            break;
          }
          case "coup": {
            const coup = monde.combattants[e.source]?.perso.coups[e.cle];
            const s = voie(ici(e.x), ecoute, 0.7);
            if (!coup || !s) break;
            if (coup.jauge) {
              // Ultime : une montée qui annonce le coup.
              ton(s, { duree: 0.55, freq: 110, freqFin: 880, onde: "sawtooth", gain: 0.09, attaque: 0.05 });
              bruit(s, { duree: 0.55, freq: 400, freqFin: 4000, q: 2, gain: 0.16, attaque: 0.1 });
            } else if (coup.hitboxes?.length) {
              bruit(s, { duree: 0.09, freq: 1800, freqFin: 700, q: 1.2, gain: 0.07, attaque: 0.01 });
            }
            break;
          }
          case "apparition": {
            const def = monde.combattants[e.source]?.perso.entites?.[e.cle];
            const s = voie(ici(e.x), ecoute, 0.8);
            if (!def || !s) break;
            if (def.touche?.radial && def.duree <= 15) explosion(s, def.ultime ? 1 : 0.7);
            else if (def.vx || def.vy) ton(s, { duree: 0.11, freq: 900, freqFin: 380, onde: "square", gain: 0.05 });
            else {
              ton(s, { duree: 0.16, freq: 210, freqFin: 120, gain: 0.14 });
              bruit(s, { duree: 0.12, freq: 600, filtre: "lowpass", gain: 0.1 });
            }
            break;
          }
          case "declenchement": {
            const s = voie(ici(e.x), ecoute);
            if (!s) break;
            ton(s, { duree: 0.05, freq: 1250, onde: "square", gain: 0.08 });
            ton(s, { duree: 0.05, freq: 1250, onde: "square", gain: 0.08, delai: 0.08 });
            bruit(s, { duree: 0.03, freq: 5000, filtre: "highpass", gain: 0.2 });
            break;
          }
          case "phase": {
            const s = voie(null, ecoute);
            if (!s) break;
            if (e.cle === "combat") {
              arpege(s, [523, 784], 0.0, "triangle", 0.12, 0.12);
              bruit(s, { duree: 0.4, freq: 6000, filtre: "highpass", gain: 0.06, attaque: 0.02 });
            } else if (e.cle === "finManche") {
              ton(s, { duree: 1.4, freq: 196, gain: 0.3, attaque: 0.005 });
              ton(s, { duree: 1.1, freq: 294, gain: 0.16, attaque: 0.005 });
              ton(s, { duree: 0.8, freq: 587, gain: 0.06, attaque: 0.005 });
            } else if (e.cle === "finPartie") {
              arpege(s, [523, 659, 784, 1047], 0.12, "triangle", 0.16);
            }
            break;
          }
        }
      }

      // Décompte : un bip par chiffre affiché.
      if (monde.phase === "decompte" && monde.phaseTicks >= 60) {
        const n = Math.floor((monde.phaseTicks - 60) / 30);
        if (n !== numeroDecompte) {
          numeroDecompte = n;
          const s = voie(null, ecoute);
          if (s) ton(s, { duree: 0.13, freq: 660, onde: "triangle", gain: 0.16 });
        }
      } else {
        numeroDecompte = -1;
      }

      // Dernières secondes du chrono : un tic par seconde.
      const seconde = Math.ceil(monde.chrono / TICKS_PAR_SECONDE);
      if (monde.phase === "combat" && monde.reglages.dureeManche > 0 && seconde <= 5 && seconde > 0 && seconde !== secondeChrono) {
        const s = voie(null, ecoute, 0.8);
        if (s) {
          ton(s, { duree: 0.05, freq: 1500, onde: "square", gain: 0.05 });
          bruit(s, { duree: 0.03, freq: 2500, q: 3, gain: 0.12 });
        }
      }
      secondeChrono = seconde;

      // Jauge d'ultime pleine (le joueur de cet écran seulement).
      const moi = monde.combattants[local];
      if (moi) {
        const pleine = moi.jauge >= JAUGE_MAX;
        if (pleine && !jaugesPleines.has(local)) {
          const s = voie(null, ecoute, 0.9);
          if (s) arpege(s, [880, 1175, 1568], 0.06, "sine", 0.1, 0.08);
        }
        if (pleine) jaugesPleines.add(local);
        else jaugesPleines.delete(local);
      }
    },

    volume(v) {
      niveau = Math.max(0, Math.min(1, v));
      // Courbe quadratique : le curseur paraît linéaire à l'oreille.
      maitre.gain.setTargetAtTime(niveau * niveau, ctx.currentTime, 0.02);
    },

    detruire() {
      window.removeEventListener("pointerdown", debloquer);
      window.removeEventListener("keydown", debloquer);
      ctx.close().catch(() => {});
    },
  };
}
