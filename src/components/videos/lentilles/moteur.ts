import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { Sons } from "./sons";

/*
 * Moteur des lentilles : la caméra passe par MediaPipe Face Landmarker
 * (478 points du visage + expressions), puis est redessinée dans un
 * <canvas> où la lentille ajoute ses effets. On enregistre ce canvas
 * (captureStream) avec le micro et les bruitages mixés : l'effet est
 * donc dans le clip lui-même. Tout est servi par le site (CSP 'self').
 */

export type Point = { x: number; y: number };

export type Visage = {
  /** Points en pixels du canvas (miroir déjà appliqué). */
  pts: Point[];
  /** Expressions MediaPipe entre 0 et 1 (jawOpen, browInnerUp, mouthSmileLeft…). */
  forme: Record<string, number>;
  /** Inclinaison de la tête (radians). */
  roll: number;
  /** Largeur du visage en pixels (joue à joue). */
  largeur: number;
};

export type Contexte = {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  /** Image propre de la caméra (miroir appliqué), avant tout effet. */
  cadre: HTMLCanvasElement;
  visage: Visage | null;
  /** Secondes depuis l'activation de la lentille, et depuis l'image précédente. */
  t: number;
  dt: number;
  /** Vrai sur l'image qui suit un toucher de l'écran. */
  toucher: boolean;
  sons: Sons;
};

export type Lentille<E = unknown> = {
  cle: string;
  nom: string;
  /** Emoji de la pastille. */
  icone: string;
  /** Comment la déclencher, affiché quand on la choisit. */
  aide: string;
  init: () => E;
  /** Dessine l'image (le cadre propre est déjà posé). */
  dessiner: (c: Contexte, e: E) => void;
};

let chargement: Promise<FaceLandmarker> | null = null;

/** Charge MediaPipe une seule fois (≈ 4 Mo de modèle + moteur WebAssembly). */
export function chargerDetecteur(): Promise<FaceLandmarker> {
  chargement ??= (async () => {
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fichiers = await FilesetResolver.forVisionTasks("/lentilles/wasm");
    const options = (delegate: "GPU" | "CPU") => ({
      baseOptions: { modelAssetPath: "/lentilles/face_landmarker.task", delegate },
      runningMode: "VIDEO" as const, numFaces: 1, outputFaceBlendshapes: true,
      minFaceDetectionConfidence: 0.5, minTrackingConfidence: 0.5,
    });
    try { return await FaceLandmarker.createFromOptions(fichiers, options("GPU")); }
    catch { return FaceLandmarker.createFromOptions(fichiers, options("CPU")); }
  })();
  chargement.catch(() => { chargement = null; });
  return chargement;
}

const PETIT_COTE_MAX = 720;
/* Sortie toujours en portrait 9:16 (recadrage centré), comme les apps de vidéos. */
const RATIO = 9 / 16;

export class Moteur {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cadre = document.createElement("canvas");
  private cadreCtx: CanvasRenderingContext2D;
  private audio: AudioContext;
  private enregistrement: MediaStreamAudioDestinationNode;
  private micro: MediaStreamAudioSourceNode | null = null;
  readonly sons: Sons;
  private image = 0;
  private dernier = 0;
  private debut = 0;
  private dernierTs = -1;
  private visage: Visage | null = null;
  private tape = false;
  private lentille: Lentille<any> | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  private etat: unknown = null;
  private sortie: MediaStream | null = null;
  private visageVu = 0;
  /** Zone de la caméra recadrée en 9:16 (pixels de la vidéo). */
  private zone = { sx: 0, sy: 0, sw: 1, sh: 1 };
  /** Appelé quand le visage apparaît/disparaît (pour l'aide à l'écran). */
  onVisage?: (present: boolean) => void;

  constructor(private video: HTMLVideoElement, private detecteur: FaceLandmarker, private camera: MediaStream, private miroir: boolean) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "studio__camera";
    this.ctx = this.canvas.getContext("2d")!;
    this.cadreCtx = this.cadre.getContext("2d")!;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audio = new Ctx();
    this.enregistrement = this.audio.createMediaStreamDestination();
    const piste = camera.getAudioTracks()[0];
    if (piste) {
      this.micro = this.audio.createMediaStreamSource(new MediaStream([piste]));
      this.micro.connect(this.enregistrement);
    }
    this.sons = new Sons(this.audio, [this.enregistrement, this.audio.destination]);
    this.dimensionner();
  }

  private dimensionner() {
    const vw = this.video.videoWidth || 720, vh = this.video.videoHeight || 1280;
    const sw = vw / vh > RATIO ? vh * RATIO : vw, sh = vw / vh > RATIO ? vh : vw / RATIO;
    this.zone = { sx: (vw - sw) / 2, sy: (vh - sh) / 2, sw, sh };
    const W = Math.round(Math.min(PETIT_COTE_MAX, sw) / 2) * 2, H = Math.round(W / RATIO / 2) * 2;
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = this.cadre.width = W;
      this.canvas.height = this.cadre.height = H;
    }
  }

  /** À appeler pendant un geste (toucher) : Safari exige un geste pour le son. */
  reveiller() { if (this.audio.state === "suspended") this.audio.resume().catch(() => {}); }

  choisir(l: Lentille<any> | null) { // eslint-disable-line @typescript-eslint/no-explicit-any
    this.lentille = l;
    this.etat = l ? l.init() : null;
    this.debut = performance.now();
  }

  toucher() { this.tape = true; this.reveiller(); }

  demarrer() {
    if (this.image) return;
    const boucle = (maintenant: number) => {
      this.image = requestAnimationFrame(boucle);
      this.dessiner(maintenant);
    };
    this.image = requestAnimationFrame(boucle);
  }

  /** Flux à enregistrer : le canvas et le son mixé (micro + bruitages). */
  flux(): MediaStream {
    if (!this.sortie) {
      const video = this.canvas.captureStream(30).getVideoTracks()[0];
      this.sortie = new MediaStream([video, ...this.enregistrement.stream.getAudioTracks()]);
    }
    return this.sortie;
  }

  get largeur() { return this.canvas.width; }
  get hauteur() { return this.canvas.height; }

  private detecter(ts: number) {
    if (ts <= this.dernierTs) return;
    this.dernierTs = ts;
    let r;
    try { r = this.detecteur.detectForVideo(this.video, ts); } catch { return; }
    const lm = r.faceLandmarks?.[0];
    const avant = !!this.visage;
    if (!lm) {
      // On garde le dernier visage un court instant (détection qui clignote).
      if (ts - this.visageVu > 250) this.visage = null;
    } else {
      this.visageVu = ts;
      const W = this.canvas.width, H = this.canvas.height;
      const vw = this.video.videoWidth, vh = this.video.videoHeight, z = this.zone;
      const pts = lm.map((p) => {
        const x = ((p.x * vw - z.sx) / z.sw) * W;
        return { x: this.miroir ? W - x : x, y: ((p.y * vh - z.sy) / z.sh) * H };
      });
      const forme: Record<string, number> = {};
      for (const c of r.faceBlendshapes?.[0]?.categories ?? []) forme[c.categoryName] = c.score;
      let a = pts[33], b = pts[263];
      if (b.x < a.x) [a, b] = [b, a];
      const roll = Math.atan2(b.y - a.y, b.x - a.x);
      const largeur = Math.hypot(pts[454].x - pts[234].x, pts[454].y - pts[234].y);
      // Lissage léger contre les tremblements.
      if (this.visage) {
        const k = 0.55;
        for (let i = 0; i < pts.length; i++) {
          const v = this.visage.pts[i];
          pts[i] = { x: v.x + (pts[i].x - v.x) * k, y: v.y + (pts[i].y - v.y) * k };
        }
      }
      this.visage = { pts, forme, roll, largeur };
    }
    if (avant !== !!this.visage) this.onVisage?.(!!this.visage);
  }

  private dessiner(maintenant: number) {
    if (this.video.readyState < 2) return;
    this.dimensionner();
    const W = this.canvas.width, H = this.canvas.height;
    const c = this.cadreCtx;
    c.save();
    if (this.miroir) { c.translate(W, 0); c.scale(-1, 1); }
    const z = this.zone;
    c.drawImage(this.video, z.sx, z.sy, z.sw, z.sh, 0, 0, W, H);
    c.restore();
    this.detecter(maintenant);
    this.ctx.save();
    this.ctx.drawImage(this.cadre, 0, 0);
    const dt = this.dernier ? Math.min(0.1, (maintenant - this.dernier) / 1000) : 1 / 30;
    this.dernier = maintenant;
    if (this.lentille) {
      try {
        this.lentille.dessiner({
          ctx: this.ctx, W, H, cadre: this.cadre, visage: this.visage,
          t: (maintenant - this.debut) / 1000, dt, toucher: this.tape, sons: this.sons,
        }, this.etat);
      } catch (e) { console.error("lentille", e); }
    }
    this.ctx.restore();
    this.tape = false;
  }

  detruire() {
    cancelAnimationFrame(this.image);
    this.image = 0;
    this.sortie?.getVideoTracks().forEach((t) => t.stop());
    this.micro?.disconnect();
    this.audio.close().catch(() => {});
    this.canvas.remove();
  }
}
