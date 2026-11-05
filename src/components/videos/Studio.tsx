"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DUREE_MAX_S, CLIPS_MAX, formatDuree } from "@/lib/videos-montage";
import { Editeur, type Reglages, type Segment } from "./Editeur";

/*
 * Studio d'enregistrement : la caméra de l'appareil, filmée directement
 * dans l'app (aucun fichier importé). On enregistre plusieurs clips
 * comme sur les réseaux sociaux, puis on passe au montage.
 */

export type Clip = { id: string; blob: Blob; url: string; duree: number; largeur: number; hauteur: number };

function typeEnregistrement(): string {
  const candidats = [
    "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm",
    "video/mp4;codecs=avc1,mp4a", "video/mp4",
  ];
  return candidats.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

let compteur = 0;
const nouvelId = () => `c${Date.now().toString(36)}${(compteur++).toString(36)}`;

export function Studio({ matieres }: { matieres: { id: number; nom: string }[] }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"camera" | "montage">("camera");
  const [clips, setClips] = useState<Clip[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [reglages, setReglages] = useState<Reglages>({ textes: [], filtre: "aucun", couverture: 0.5 });

  // Les clips restent en mémoire : prévenir avant de quitter la page.
  useEffect(() => {
    if (clips.length === 0) return;
    const avertir = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", avertir);
    return () => window.removeEventListener("beforeunload", avertir);
  }, [clips.length]);

  useEffect(() => () => { clips.forEach((c) => URL.revokeObjectURL(c.url)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dureeMontage = segments.reduce((s, x) => s + (x.fin - x.debut), 0);

  function quitter() {
    if (clips.length > 0 && !confirm("Abandonner cette vidéo ? Les clips enregistrés seront perdus.")) return;
    router.push("/divertissement/videos");
  }

  const ajouterClip = useCallback((c: Clip) => {
    setClips((l) => [...l, c]);
    setSegments((s) => [...s, { cle: nouvelId(), clip: c.id, debut: 0, fin: c.duree, muet: false }]);
  }, []);

  function retirerDernier() {
    const dernier = segments.at(-1);
    if (!dernier) return;
    setSegments((s) => s.slice(0, -1));
    if (!segments.slice(0, -1).some((s) => s.clip === dernier.clip)) {
      setClips((l) => l.filter((c) => { if (c.id === dernier.clip) { URL.revokeObjectURL(c.url); return false; } return true; }));
    }
  }

  if (phase === "montage" && segments.length > 0) {
    return <Editeur clips={clips} segments={segments} setSegments={setSegments} matieres={matieres}
                    reglages={reglages} setReglages={setReglages}
                    onCamera={() => setPhase("camera")} onQuitter={quitter} />;
  }
  return <Camera reste={DUREE_MAX_S - dureeMontage} nbSegments={segments.length} dureeMontage={dureeMontage}
                 peutAjouter={clips.length < CLIPS_MAX}
                 onClip={ajouterClip} onAnnulerDernier={retirerDernier} onSuivant={() => setPhase("montage")}
                 onQuitter={quitter} />;
}

function Camera({ reste, nbSegments, dureeMontage, peutAjouter, onClip, onAnnulerDernier, onSuivant, onQuitter }: {
  reste: number; nbSegments: number; dureeMontage: number; peutAjouter: boolean;
  onClip: (c: Clip) => void; onAnnulerDernier: () => void; onSuivant: () => void; onQuitter: () => void;
}) {
  const apercu = useRef<HTMLVideoElement>(null);
  const flux = useRef<MediaStream | null>(null);
  const enregistreur = useRef<MediaRecorder | null>(null);
  const [face, setFace] = useState<"user" | "environment">("user");
  const [pret, setPret] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [ecoule, setEcoule] = useState(0);
  const [minuteur, setMinuteur] = useState(false);
  const [decompte, setDecompte] = useState<number | null>(null);
  const [plusieursCameras, setPlusieursCameras] = useState(false);

  // Ouvre la caméra (et la referme en quittant ou en changeant de côté).
  useEffect(() => {
    let annule = false;
    setPret(false);
    setErreur(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setErreur("Ce navigateur ne permet pas de filmer. Ouvrez le site dans Safari ou Chrome, en https.");
      return;
    }
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: face, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      audio: { echoCancellation: true, noiseSuppression: true },
    }).then(async (s) => {
      if (annule) { s.getTracks().forEach((t) => t.stop()); return; }
      flux.current = s;
      const el = apercu.current;
      if (el) { el.srcObject = s; await el.play().catch(() => {}); }
      setPret(true);
      const appareils = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      setPlusieursCameras(appareils.filter((d) => d.kind === "videoinput").length > 1);
    }).catch((e: DOMException) => {
      if (annule) return;
      setErreur(e.name === "NotAllowedError"
        ? "Accès à la caméra refusé. Autorisez la caméra et le micro pour ce site dans les réglages du navigateur, puis rechargez."
        : e.name === "NotFoundError" ? "Aucune caméra trouvée sur cet appareil."
        : "Impossible d’ouvrir la caméra (déjà utilisée par une autre app ?).");
    });
    return () => {
      annule = true;
      flux.current?.getTracks().forEach((t) => t.stop());
      flux.current = null;
    };
  }, [face]);

  const arreter = useCallback(() => {
    const r = enregistreur.current;
    if (r && r.state !== "inactive") r.stop();
  }, []);

  function demarrer() {
    const s = flux.current, el = apercu.current;
    if (!s || !el) return;
    const type = typeEnregistrement();
    let r: MediaRecorder;
    try {
      r = new MediaRecorder(s, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 });
    } catch {
      setErreur("L’enregistrement vidéo n’est pas pris en charge par ce navigateur.");
      return;
    }
    const morceaux: Blob[] = [];
    const largeur = el.videoWidth, hauteur = el.videoHeight;
    const t0 = performance.now();
    r.ondataavailable = (e) => { if (e.data.size) morceaux.push(e.data); };
    r.onstop = () => {
      setEnCours(false);
      const duree = Math.min((performance.now() - t0) / 1000, reste);
      const blob = new Blob(morceaux, { type: r.mimeType || type || "video/webm" });
      if (duree < 0.5 || blob.size === 0) return;
      onClip({ id: nouvelId(), blob, url: URL.createObjectURL(blob), duree: Math.floor(duree * 10) / 10, largeur, hauteur });
    };
    enregistreur.current = r;
    r.start(1000);
    setEcoule(0);
    setEnCours(true);
  }

  // Chrono et arrêt automatique à la durée maximale.
  useEffect(() => {
    if (!enCours) return;
    const t0 = performance.now();
    const id = setInterval(() => {
      const s = (performance.now() - t0) / 1000;
      setEcoule(s);
      if (s >= reste) arreter();
    }, 100);
    return () => clearInterval(id);
  }, [enCours, reste, arreter]);

  useEffect(() => {
    if (decompte === null) return;
    if (decompte === 0) { setDecompte(null); demarrer(); return; }
    const t = setTimeout(() => setDecompte((d) => (d ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  }, [decompte]); // eslint-disable-line react-hooks/exhaustive-deps

  function bouton() {
    if (enCours) { arreter(); return; }
    if (decompte !== null) { setDecompte(null); return; }
    if (!pret || reste < 1 || !peutAjouter) return;
    if (minuteur) setDecompte(3); else demarrer();
  }

  const total = dureeMontage + (enCours ? ecoule : 0);
  const plein = reste < 1 || !peutAjouter;

  return (
    <div className="studio">
      <video ref={apercu} className="studio__camera" data-miroir={face === "user" || undefined} muted playsInline autoPlay />

      <div className="studio__haut">
        <div className="studio__jauge" role="progressbar" aria-label="Durée enregistrée"
             aria-valuemin={0} aria-valuemax={DUREE_MAX_S} aria-valuenow={Math.round(total)}>
          <span style={{ width: `${(total / DUREE_MAX_S) * 100}%` }} />
        </div>
        <div className="flex items-center justify-between">
          <button type="button" className="studio__icone" onClick={onQuitter} aria-label="Fermer le studio" disabled={enCours}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
          <span className={`studio__chrono tabular ${enCours ? "studio__chrono--rec" : ""}`}>
            {formatDuree(total)} / {formatDuree(DUREE_MAX_S)}
          </span>
          <span className="w-11" />
        </div>
      </div>

      <div className="studio__cote">
        {plusieursCameras && (
          <button type="button" className="studio__icone" disabled={enCours || decompte !== null}
                  onClick={() => setFace((f) => (f === "user" ? "environment" : "user"))} aria-label="Changer de caméra">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" /><path d="M9.5 13a2.5 2.5 0 0 1 4.6-1.4M14.5 13.5a2.5 2.5 0 0 1-4.6 1.4M14.5 10v2h-2M9.5 17v-2h2" />
            </svg>
          </button>
        )}
        <button type="button" className="studio__icone" aria-pressed={minuteur} disabled={enCours}
                onClick={() => setMinuteur((m) => !m)} aria-label="Minuteur de 3 secondes">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9.5 2.5h5" />
          </svg>
          <span className="studio__mini">{minuteur ? "3 s" : "Off"}</span>
        </button>
      </div>

      {decompte !== null && <span className="studio__decompte" aria-live="assertive">{decompte}</span>}

      {erreur && (
        <div className="studio__erreur" role="alert">
          <p>{erreur}</p>
          <button type="button" className="bouton-principal mt-4 h-11 px-5" onClick={onQuitter}>Retour</button>
        </div>
      )}

      <div className="studio__bas">
        <div className="flex w-20 justify-center">
          {nbSegments > 0 && !enCours && (
            <button type="button" className="studio__icone" onClick={onAnnulerDernier} aria-label="Supprimer le dernier clip">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 7H4V2" /><path d="M4.5 7A8.5 8.5 0 1 1 3.5 12" /></svg>
              <span className="studio__mini">Clip</span>
            </button>
          )}
        </div>
        <button type="button" onClick={bouton} disabled={!pret || (plein && !enCours)}
                className="studio__rec" data-actif={enCours || undefined}
                aria-label={enCours ? "Arrêter le clip" : decompte !== null ? "Annuler le minuteur" : "Enregistrer un clip"}>
          <span />
        </button>
        <div className="flex w-20 justify-center">
          {nbSegments > 0 && !enCours && (
            <button type="button" className="studio__suivant" onClick={onSuivant}>
              Suivant
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
            </button>
          )}
        </div>
      </div>
      <p className="studio__aide">
        {plein ? "Durée maximale atteinte : passez au montage."
          : enCours ? "Touchez pour arrêter ce clip"
          : nbSegments > 0 ? `${nbSegments} clip${nbSegments > 1 ? "s" : ""} · touchez pour en ajouter un`
          : "Touchez pour filmer · plusieurs clips possibles"}
      </p>
    </div>
  );
}
