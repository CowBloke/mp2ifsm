/*
 * Vidéos importées depuis la galerie du téléphone. Le fichier est gardé
 * tel quel s'il tient dans la place restante ; sinon on le réenregistre
 * en 720p en le relisant (canvas + Web Audio + MediaRecorder), comme un
 * clip filmé : aucun encodeur à embarquer, mais cela prend sa durée.
 */

export type InfosVideo = { duree: number; largeur: number; hauteur: number };

// Débits des clips filmés dans l'app (voir Studio) : ≈ 0,33 Mo par seconde.
export const DEBIT_VIDEO = 2_500_000;
export const DEBIT_AUDIO = 128_000;
const DEBIT_MIN = 700_000;
const COTE_MAX = 1280;

function element(url: string): HTMLVideoElement {
  const v = document.createElement("video");
  v.playsInline = true;
  v.preload = "auto";
  v.src = url;
  return v;
}

function attendre(v: HTMLVideoElement, evenement: string, delai = 20_000): Promise<void> {
  return new Promise((ok, ko) => {
    const fin = () => { clearTimeout(t); v.removeEventListener(evenement, succes); v.removeEventListener("error", echec); };
    const succes = () => { fin(); ok(); };
    const echec = () => { fin(); ko(new Error("illisible")); };
    const t = setTimeout(() => { fin(); ko(new Error("délai")); }, delai);
    v.addEventListener(evenement, succes);
    v.addEventListener("error", echec);
  });
}

/** Durée et dimensions affichées (rotation du téléphone comprise). */
export async function lireInfos(fichier: File): Promise<InfosVideo> {
  const url = URL.createObjectURL(fichier);
  const v = element(url);
  v.preload = "metadata";
  v.muted = true;
  try {
    await attendre(v, "loadedmetadata");
    // Certains WebM n'annoncent pas leur durée : on la force en cherchant loin.
    if (!Number.isFinite(v.duration)) {
      v.currentTime = 1e7;
      await attendre(v, "durationchange").catch(() => {});
    }
    if (!v.videoWidth || !v.videoHeight) throw new Error("sans image");
    if (!Number.isFinite(v.duration) || v.duration <= 0) throw new Error("durée inconnue");
    return { duree: v.duration, largeur: v.videoWidth, hauteur: v.videoHeight };
  } finally {
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
  }
}

/** Débit vidéo pour que `duree` secondes tiennent dans `place` octets, ou null si impossible. */
export function debitPour(duree: number, place: number): number | null {
  const d = Math.min(DEBIT_VIDEO, (place * 8 * 0.9) / Math.max(1, duree) - DEBIT_AUDIO);
  return d >= DEBIT_MIN ? Math.floor(d) : null;
}

/**
 * Réenregistre les `limite` premières secondes de `fichier` en ≤ 1280 px.
 * À appeler depuis un geste (toucher) : lecture avec son et AudioContext.
 */
export async function recompresser(fichier: File, opts: {
  limite: number; debit: number; type: string; signal: AbortSignal; onProgres: (p: number) => void;
}): Promise<{ blob: Blob; duree: number; largeur: number; hauteur: number }> {
  const url = URL.createObjectURL(fichier);
  const v = element(url);
  // Présente dans la page (sinon certains navigateurs ne décodent pas les images), mais invisible.
  Object.assign(v.style, { position: "fixed", left: "0", top: "0", width: "2px", height: "2px", opacity: "0.01", pointerEvents: "none" });
  document.body.appendChild(v);
  const contexteAudio = new AudioContext();
  let enregistreur: MediaRecorder | null = null;
  let flux: MediaStream | null = null;
  const nettoyer = () => {
    flux?.getTracks().forEach((t) => t.stop());
    v.pause();
    v.remove();
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
    contexteAudio.close().catch(() => {});
  };
  try {
    // Lecture lancée tout de suite pour rester dans le geste de l'utilisateur.
    const lecture = v.play();
    await attendre(v, "loadedmetadata");
    v.pause();
    await lecture.catch(() => {});
    const echelle = Math.min(1, COTE_MAX / Math.max(v.videoWidth, v.videoHeight));
    const largeur = Math.round((v.videoWidth * echelle) / 2) * 2, hauteur = Math.round((v.videoHeight * echelle) / 2) * 2;
    const canvas = document.createElement("canvas");
    canvas.width = largeur;
    canvas.height = hauteur;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    flux = canvas.captureStream(30);
    // Le son passe par Web Audio vers l'enregistreur, pas vers les haut-parleurs.
    const destination = contexteAudio.createMediaStreamDestination();
    contexteAudio.createMediaElementSource(v).connect(destination);
    destination.stream.getAudioTracks().forEach((t) => flux!.addTrack(t));
    await contexteAudio.resume();

    const limite = Math.min(opts.limite, v.duration);
    v.currentTime = 0;
    ctx.drawImage(v, 0, 0, largeur, hauteur);
    const r = new MediaRecorder(flux, {
      ...(opts.type ? { mimeType: opts.type } : {}), videoBitsPerSecond: opts.debit, audioBitsPerSecond: DEBIT_AUDIO,
    });
    enregistreur = r;
    const morceaux: Blob[] = [];
    r.ondataavailable = (e) => { if (e.data.size) morceaux.push(e.data); };
    const fini = new Promise<void>((ok) => { r.onstop = () => ok(); });

    let arrete = false;
    const arreter = () => { if (arrete) return; arrete = true; if (r.state !== "inactive") r.stop(); v.pause(); };
    const dessiner = () => {
      if (arrete) return;
      ctx.drawImage(v, 0, 0, largeur, hauteur);
      opts.onProgres(Math.min(1, v.currentTime / limite));
      if (v.currentTime >= limite || v.ended) arreter();
    };
    const boucle = () => { dessiner(); if (!arrete) requestAnimationFrame(boucle); };
    // En arrière-plan, l'image se fige : on met tout en pause jusqu'au retour.
    const visibilite = () => {
      if (arrete) return;
      if (document.hidden) { v.pause(); if (r.state === "recording") r.pause(); }
      else { if (r.state === "paused") r.resume(); v.play().catch(() => {}); requestAnimationFrame(boucle); }
    };
    document.addEventListener("visibilitychange", visibilite);
    v.addEventListener("ended", arreter);
    opts.signal.addEventListener("abort", arreter);

    r.start(1000);
    await v.play();
    requestAnimationFrame(boucle);
    await fini;
    document.removeEventListener("visibilitychange", visibilite);
    if (opts.signal.aborted) throw new DOMException("annulé", "AbortError");
    const duree = Math.min(limite, v.currentTime);
    const blob = new Blob(morceaux, { type: r.mimeType || opts.type || "video/webm" });
    if (blob.size === 0 || duree < 0.5) throw new Error("vide");
    return { blob, duree, largeur, hauteur };
  } finally {
    if (enregistreur && enregistreur.state !== "inactive") enregistreur.stop();
    nettoyer();
  }
}
