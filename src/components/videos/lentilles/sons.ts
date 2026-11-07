/*
 * Bruitages des lentilles, synthétisés en Web Audio (aucun extrait de
 * mème ni d'œuvre tierce). Ils partent à la fois dans l'enregistrement
 * (mixés au micro) et dans le haut-parleur.
 */

export class Sons {
  readonly ctx: AudioContext;
  readonly sortie: GainNode;
  private bruitBuf: AudioBuffer;

  constructor(ctx: AudioContext, destinations: AudioNode[]) {
    this.ctx = ctx;
    this.sortie = ctx.createGain();
    this.sortie.gain.value = 0.9;
    for (const d of destinations) this.sortie.connect(d);
    const n = ctx.sampleRate * 2;
    this.bruitBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = this.bruitBuf.getChannelData(0);
    let x = 12345;
    for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; data[i] = x / 0x3fffffff - 1; }
  }

  private get t() { return this.ctx.currentTime; }

  private env(g: GainNode, debut: number, pic: number, attaque: number, duree: number) {
    g.gain.setValueAtTime(0.0001, debut);
    g.gain.exponentialRampToValueAtTime(pic, debut + attaque);
    g.gain.exponentialRampToValueAtTime(0.0001, debut + duree);
  }

  private osc(type: OscillatorType, f: number, debut: number, duree: number, pic: number, filtre?: number, dest: AudioNode = this.sortie) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, debut);
    let n: AudioNode = o;
    if (filtre) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = filtre;
      o.connect(lp); n = lp;
    }
    n.connect(g); g.connect(dest);
    this.env(g, debut, pic, 0.01, duree);
    o.start(debut); o.stop(debut + duree + 0.05);
    return o;
  }

  private bruit(debut: number, duree: number, pic: number, type: BiquadFilterType, f: number, q = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.bruitBuf;
    const b = this.ctx.createBiquadFilter();
    b.type = type; b.frequency.value = f; b.Q.value = q;
    const g = this.ctx.createGain();
    s.connect(b); b.connect(g); g.connect(this.sortie);
    this.env(g, debut, pic, 0.005, duree);
    s.start(debut, Math.random()); s.stop(debut + duree + 0.05);
    return { source: s, filtre: b };
  }

  private saturation(k: number): WaveShaperNode {
    const w = this.ctx.createWaveShaper();
    const c = new Float32Array(1024);
    for (let i = 0; i < c.length; i++) { const x = (i / 512) - 1; c[i] = Math.tanh(k * x); }
    w.curve = c;
    return w;
  }

  /** Grosse basse qui cogne (façon « boom » des vidéos virales). */
  boom() {
    const t = this.t;
    const sat = this.saturation(4);
    const g = this.ctx.createGain();
    sat.connect(g); g.connect(this.sortie);
    this.env(g, t, 0.9, 0.005, 1.4);
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.9);
    o.connect(sat);
    o.start(t); o.stop(t + 1.5);
    this.bruit(t, 0.25, 0.5, "lowpass", 900);
  }

  /** « Tan tan taaan » dramatique : cuivres synthétiques + roulement. */
  dramatique() {
    const t = this.t;
    const notes: [number, number, number][] = [[0, 0.22, 146.8], [0.3, 0.22, 146.8], [0.6, 1.6, 138.6]];
    for (const [d, duree, f] of notes) {
      for (const m of [1, 1.5, 2]) {
        const o = this.osc("sawtooth", f * m, t + d, duree, 0.12 / m, 1400);
        o.detune.value = (m - 1.5) * 8;
      }
      this.osc("sine", f / 2, t + d, duree, 0.35);
    }
    for (let i = 0; i < 14; i++) this.bruit(t + 0.6 + i * 0.07, 0.12, 0.18 + i * 0.015, "bandpass", 180, 2);
  }

  /** Laser qui grésille, en boucle tant qu'on le relance. */
  laser() {
    const t = this.t;
    for (let i = 0; i < 4; i++) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(1800, t + i * 0.09);
      o.frequency.exponentialRampToValueAtTime(220, t + i * 0.09 + 0.12);
      o.connect(g); g.connect(this.sortie);
      this.env(g, t + i * 0.09, 0.12, 0.004, 0.13);
      o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.2);
    }
    this.osc("square", 55, t, 0.5, 0.15, 300);
  }

  /** Disque rayé (arrêt sur image). */
  rayure() {
    const t = this.t;
    const { source, filtre } = this.bruit(t, 0.45, 0.7, "bandpass", 1200, 3);
    source.playbackRate.setValueAtTime(0.6, t);
    source.playbackRate.linearRampToValueAtTime(2.4, t + 0.12);
    source.playbackRate.linearRampToValueAtTime(0.3, t + 0.4);
    filtre.frequency.setValueAtTime(800, t);
    filtre.frequency.linearRampToValueAtTime(3500, t + 0.12);
    filtre.frequency.linearRampToValueAtTime(400, t + 0.4);
  }

  /** Buzzer de jeu télé (mensonge). */
  buzzer() {
    const t = this.t;
    this.osc("square", 110, t, 0.7, 0.22, 1600);
    this.osc("square", 116, t, 0.7, 0.18, 1600);
  }

  /** Ding (vérité). */
  ding() {
    const t = this.t;
    this.osc("sine", 1318.5, t, 1.2, 0.3);
    this.osc("sine", 1975.5, t + 0.12, 1.2, 0.22);
  }

  /** Petit clic du randomiseur. */
  tic(aigu = false) {
    this.osc("square", aigu ? 1800 : 1200, this.t, 0.03, 0.08, 4000);
  }

  /** Fanfare courte (le randomiseur s'arrête). */
  fanfare() {
    const t = this.t;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.osc("triangle", f, t + i * 0.08, i === 3 ? 0.6 : 0.12, 0.2));
  }

  /** Blip de dialogue de jeu vidéo. */
  blip() {
    this.osc("square", 520 + Math.random() * 80, this.t, 0.04, 0.05, 3000);
  }

  /** Lunettes qui tombent : glissando descendant 8 bits. */
  chute() {
    const t = this.t;
    const o = this.osc("square", 1200, t, 0.5, 0.08, 3000);
    o.frequency.exponentialRampToValueAtTime(200, t + 0.5);
  }

  /** Accord grave (« aïe ») pour le moral qui baisse. */
  aie() {
    const t = this.t;
    this.osc("triangle", 392, t, 0.15, 0.15);
    this.osc("triangle", 370, t + 0.15, 0.15, 0.15);
    this.osc("triangle", 349, t + 0.3, 0.15, 0.15);
    this.osc("triangle", 330, t + 0.45, 0.7, 0.15);
  }
}
