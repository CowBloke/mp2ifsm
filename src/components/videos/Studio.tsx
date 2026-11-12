"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DUREE_MAX_S, CLIPS_MAX, FILTRES, TAILLE_MAX_VIDEO, filtreCss, formatDuree, vignetteCss } from "@/lib/videos-montage";
import { Editeur, type Reglages, type Segment } from "./Editeur";
import { FeuilleMusique, PastilleMusique, type MusiqueChoisie } from "./Musique";
import { LENTILLES, parCle } from "./lentilles/catalogue";
import { chargerDetecteur, Moteur } from "./lentilles/moteur";
import { debitPour, lireInfos, recompresser, type InfosVideo } from "./importer";

/*
 * Studio d'enregistrement : la caméra de l'appareil, filmée directement
 * dans l'app, ou des vidéos importées de la galerie du téléphone. On
 * enchaîne plusieurs clips comme sur les réseaux sociaux, puis on passe
 * au montage.
 */

export type Clip = { id: string; blob: Blob; url: string; duree: number; largeur: number; hauteur: number; filtre: string };

const CLES_FILTRES = Object.keys(FILTRES);
const CLES_LENTILLES = ["aucune", ...LENTILLES.map((l) => l.cle)];
const nomLentille = (k: string) => parCle(k)?.nom ?? "Sans lentille";

function typeEnregistrement(): string {
  const candidats = [
    "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm",
    "video/mp4;codecs=avc1,mp4a", "video/mp4",
  ];
  return candidats.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

const mo = (octets: number) => (Math.max(0, octets) / 1048576).toFixed(1).replace(".", ",");

type Importation = {
  fichier: File; infos: InfosVideo | null; limite: number; place: number;
  debit: number | null; progres: number | null; erreur: string | null;
};

let compteur = 0;
const nouvelId = () => `c${Date.now().toString(36)}${(compteur++).toString(36)}`;

export function Studio({ matieres }: { matieres: { id: number; nom: string }[] }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"camera" | "montage">("camera");
  const [clips, setClips] = useState<Clip[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [reglages, setReglages] = useState<Reglages>({ textes: [], couverture: 0.5, musique: null });
  const [filtre, setFiltre] = useState("aucun");

  // Un fichier importé vit en mémoire (blob:) : libéré quand on en change.
  const urlMusique = reglages.musique?.cle === "perso" ? reglages.musique.url : null;
  useEffect(() => () => { if (urlMusique) URL.revokeObjectURL(urlMusique); }, [urlMusique]);
  const choisirMusique = useCallback((m: MusiqueChoisie | null) => setReglages((r) => ({ ...r, musique: m })), []);

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

  const ajouterClip = useCallback((c: Clip, fin = c.duree) => {
    setClips((l) => [...l, c]);
    setSegments((s) => [...s, { cle: nouvelId(), clip: c.id, debut: 0, fin, muet: false, filtre: c.filtre }]);
  }, []);

  // --- Import depuis la galerie -----------------------------------------
  const [importation, setImportation] = useState<Importation | null>(null);
  const annulation = useRef<AbortController | null>(null);
  const reste = DUREE_MAX_S - dureeMontage;
  // Place restante sous la limite d'envoi (clips déjà là + musique importée).
  const place = TAILLE_MAX_VIDEO - clips.reduce((s, c) => s + c.blob.size, 0)
    - (reglages.musique?.cle === "perso" ? reglages.musique.fichier?.size ?? 0 : 0) - 512 * 1024;

  async function importer(fichier: File) {
    if (reste < 1 || clips.length >= CLIPS_MAX) return;
    const base: Importation = { fichier, infos: null, limite: 0, place, debit: null, progres: null, erreur: null };
    setImportation(base);
    let infos: InfosVideo;
    try {
      infos = await lireInfos(fichier);
    } catch {
      setImportation({ ...base, erreur: "Cette vidéo ne peut pas être lue par ce navigateur (format non pris en charge). Essayez une vidéo filmée en H.264, ou filmez-la directement ici." });
      return;
    }
    const limite = Math.min(infos.duree, reste);
    if (limite < 0.5) { setImportation({ ...base, erreur: "Cette vidéo est trop courte." }); return; }
    if (fichier.size <= place) {
      // Le fichier tient tel quel : le clip entier est gardé, le montage s'arrête à la durée restante.
      ajouterClip({ id: nouvelId(), blob: fichier, url: URL.createObjectURL(fichier), duree: Math.floor(infos.duree * 10) / 10,
                    largeur: infos.largeur, hauteur: infos.hauteur, filtre: "aucun" }, Math.floor(limite * 10) / 10);
      setImportation(null);
      setPhase("montage");
      return;
    }
    setImportation({ ...base, infos, limite, debit: debitPour(limite, place) });
  }

  async function reenregistrer() {
    const imp = importation;
    if (!imp?.infos || !imp.debit) return;
    const ctrl = new AbortController();
    annulation.current = ctrl;
    setImportation({ ...imp, progres: 0 });
    try {
      const r = await recompresser(imp.fichier, {
        limite: imp.limite, debit: imp.debit, type: typeEnregistrement(), signal: ctrl.signal,
        onProgres: (p) => setImportation((x) => (x && x.progres !== null ? { ...x, progres: p } : x)),
      });
      const duree = Math.floor(r.duree * 10) / 10;
      ajouterClip({ id: nouvelId(), blob: r.blob, url: URL.createObjectURL(r.blob), duree, largeur: r.largeur, hauteur: r.hauteur, filtre: "aucun" });
      setImportation(null);
      setPhase("montage");
    } catch (e) {
      if (ctrl.signal.aborted) { setImportation(null); return; }
      console.error("import vidéo:", e);
      setImportation({ ...imp, progres: null, erreur: "Le réenregistrement a échoué sur cet appareil. Essayez une vidéo plus courte." });
    } finally {
      annulation.current = null;
    }
  }

  function fermerImport() {
    annulation.current?.abort();
    setImportation(null);
  }

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
  return (
    <>
      <Camera reste={reste} nbSegments={segments.length} dureeMontage={dureeMontage}
              peutAjouter={clips.length < CLIPS_MAX}
              filtre={filtre} setFiltre={setFiltre} musique={reglages.musique} onMusique={choisirMusique}
              onClip={ajouterClip} onImporter={importer} onAnnulerDernier={retirerDernier} onSuivant={() => setPhase("montage")}
              onQuitter={quitter} />
      {importation && <FeuilleImport imp={importation} reste={reste} onReenregistrer={reenregistrer} onFermer={fermerImport} />}
    </>
  );
}

/* Étapes d'un import : lecture, choix du réenregistrement, progression ou erreur. */
function FeuilleImport({ imp, reste, onReenregistrer, onFermer }: {
  imp: Importation; reste: number; onReenregistrer: () => void; onFermer: () => void;
}) {
  const { infos, progres, erreur } = imp;
  const coupe = infos && infos.duree > reste + 0.2;
  return (
    <div className="reels__voile import__voile">
      <div role="dialog" aria-modal="true" aria-labelledby="import-titre" className="reels__feuille musique__feuille import__feuille">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/25" aria-hidden="true" />
        <h2 id="import-titre" className="w-full text-center text-[15px] font-semibold">
          {erreur ? "Import impossible" : !infos ? "Lecture de la vidéo…" : progres !== null ? "Préparation de la vidéo…" : "Vidéo trop lourde"}
        </h2>
        <p className="mt-1 truncate text-center text-[12px] opacity-60">{imp.fichier.name} · {mo(imp.fichier.size)} Mo</p>
        {erreur ? (
          <p role="alert" className="mt-4 text-[14px] leading-snug text-[#ff8a8a]">{erreur}</p>
        ) : !infos ? (
          <div className="mt-6 flex justify-center"><span className="reels__chargement" aria-hidden="true" /></div>
        ) : progres !== null ? (
          <>
            <div className="studio__jauge import__jauge mt-5" role="progressbar" aria-label="Préparation"
                 aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progres * 100)}>
              <span style={{ width: `${progres * 100}%` }} />
            </div>
            <p className="mt-2 text-center text-[13px] tabular opacity-80">
              {Math.round(progres * 100)} % · encore {formatDuree(Math.max(0, imp.limite * (1 - progres)))}
            </p>
            <p className="mt-3 text-center text-[12px] opacity-60">Gardez l’écran allumé et l’app ouverte.</p>
          </>
        ) : imp.debit ? (
          <p className="mt-4 text-[14px] leading-snug opacity-85">
            Elle dépasse la place disponible ({mo(imp.place)} Mo). L’app peut la réenregistrer en 720p :
            cela prend la durée de la vidéo ({formatDuree(imp.limite)}), écran allumé.
            {coupe && ` Seul le début (${formatDuree(imp.limite)}) sera gardé : 3 min au total.`}
          </p>
        ) : (
          <p role="alert" className="mt-4 text-[14px] leading-snug text-[#ff8a8a]">
            Plus assez de place pour cette vidéo ({mo(imp.place)} Mo restants) : retirez des clips ou choisissez une vidéo plus courte.
          </p>
        )}
        <div className="mt-5 flex gap-2">
          {infos && !erreur && progres === null && imp.debit && (
            <button type="button" className="bouton-principal h-11 flex-1" onClick={onReenregistrer}>Réenregistrer</button>
          )}
          <button type="button" className="musique__importer" onClick={onFermer}>
            {erreur || (infos && !imp.debit) ? "Fermer" : "Annuler"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Camera({ reste, nbSegments, dureeMontage, peutAjouter, filtre, setFiltre, musique, onMusique, onClip, onImporter, onAnnulerDernier, onSuivant, onQuitter }: {
  reste: number; nbSegments: number; dureeMontage: number; peutAjouter: boolean;
  filtre: string; setFiltre: (f: string) => void;
  musique: MusiqueChoisie | null; onMusique: (m: MusiqueChoisie | null) => void;
  onClip: (c: Clip) => void; onImporter: (f: File) => void;
  onAnnulerDernier: () => void; onSuivant: () => void; onQuitter: () => void;
}) {
  const choixFichier = useRef<HTMLInputElement>(null);
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
  const [feuilleSon, setFeuilleSon] = useState(false);
  // Nom du filtre affiché en grand un instant après un changement (comme sur Snap).
  const [annonce, setAnnonce] = useState<{ nom: string; k: number } | null>(null);
  const glisse = useRef<{ x: number; y: number } | null>(null);
  const bande = useRef<HTMLDivElement>(null);
  const filtreEnregistre = useRef(filtre);
  const [mode, setMode] = useState<"filtres" | "lentilles">("filtres");
  const [lentille, setLentille] = useState("aucune");
  const [lentillePrete, setLentillePrete] = useState(false);
  const [erreurLentille, setErreurLentille] = useState<string | null>(null);
  const [visage, setVisage] = useState(true);
  const moteur = useRef<Moteur | null>(null);
  const scene = useRef<HTMLDivElement>(null);
  const [fluxPret, setFluxPret] = useState(0);
  const actifLentille = lentille !== "aucune";
  // L'explication de la lentille s'affiche 4 s, puis laisse la place à l'effet.
  const [aideVisible, setAideVisible] = useState(false);
  useEffect(() => {
    if (!actifLentille) return;
    setAideVisible(true);
    const t = setTimeout(() => setAideVisible(false), 4000);
    return () => clearTimeout(t);
  }, [lentille, actifLentille]);

  // Moteur des lentilles : créé à la première lentille, refait si la caméra change.
  useEffect(() => {
    if (!actifLentille || !pret) return;
    let annule = false;
    setErreurLentille(null);
    chargerDetecteur().then((det) => {
      const el = apercu.current, s = flux.current, h = scene.current;
      if (annule || !el || !s || !h) return;
      const m = new Moteur(el, det, s, face === "user");
      m.onVisage = setVisage;
      m.choisir(parCle(lentille));
      h.appendChild(m.canvas);
      m.demarrer();
      moteur.current = m;
      setLentillePrete(true);
    }).catch(() => { if (!annule) setErreurLentille("Les lentilles ne se chargent pas sur cet appareil."); });
    return () => {
      annule = true;
      moteur.current?.detruire();
      moteur.current = null;
      setLentillePrete(false);
    };
  }, [actifLentille, pret, face, fluxPret]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { moteur.current?.choisir(parCle(lentille)); }, [lentille, lentillePrete]);
  const changerFiltre = useCallback((cle: string) => {
    setFiltre(cle);
    setAnnonce({ nom: FILTRES[cle].libelle, k: Date.now() });
  }, [setFiltre]);

  const changerLentille = useCallback((cle: string) => {
    moteur.current?.reveiller();
    setLentille(cle);
    setAnnonce({ nom: nomLentille(cle), k: Date.now() });
  }, []);

  function decaler(d: 1 | -1) {
    if (mode === "lentilles") {
      const i = CLES_LENTILLES.indexOf(lentille);
      changerLentille(CLES_LENTILLES[(i + d + CLES_LENTILLES.length) % CLES_LENTILLES.length]);
      return;
    }
    const i = CLES_FILTRES.indexOf(filtre);
    changerFiltre(CLES_FILTRES[(i + d + CLES_FILTRES.length) % CLES_FILTRES.length]);
  }

  useEffect(() => {
    if (!annonce) return;
    const t = setTimeout(() => setAnnonce(null), 900);
    return () => clearTimeout(t);
  }, [annonce]);

  // Garde la pastille du filtre choisi au centre de la bande.
  useEffect(() => {
    const b = bande.current;
    const el = b?.querySelector<HTMLElement>(`[data-filtre="${mode === "lentilles" ? lentille : filtre}"]`);
    if (b && el) b.scrollTo({ left: el.offsetLeft - b.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" });
  }, [filtre, lentille, mode]);
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
      setFluxPret((n) => n + 1);
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
    const camera = flux.current, el = apercu.current;
    if (!camera || !el) return;
    // Avec une lentille, on enregistre le rendu (canvas + micro + bruitages).
    const m = actifLentille && lentillePrete ? moteur.current : null;
    m?.reveiller();
    const s = m ? m.flux() : camera;
    const type = typeEnregistrement();
    let r: MediaRecorder;
    try {
      r = new MediaRecorder(s, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 });
    } catch {
      setErreur("L’enregistrement vidéo n’est pas pris en charge par ce navigateur.");
      return;
    }
    const morceaux: Blob[] = [];
    const largeur = m ? m.largeur : el.videoWidth, hauteur = m ? m.hauteur : el.videoHeight;
    filtreEnregistre.current = filtre;
    const t0 = performance.now();
    r.ondataavailable = (e) => { if (e.data.size) morceaux.push(e.data); };
    r.onstop = () => {
      setEnCours(false);
      const duree = Math.min((performance.now() - t0) / 1000, reste);
      const blob = new Blob(morceaux, { type: r.mimeType || type || "video/webm" });
      if (duree < 0.5 || blob.size === 0) return;
      onClip({ id: nouvelId(), blob, url: URL.createObjectURL(blob), duree: Math.floor(duree * 10) / 10, largeur, hauteur,
               filtre: filtreEnregistre.current });
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
    if (actifLentille && !lentillePrete) return;
    if (minuteur) setDecompte(3); else demarrer();
  }

  const total = dureeMontage + (enCours ? ecoule : 0);
  const plein = reste < 1 || !peutAjouter;

  const vignette = vignetteCss(filtre);

  return (
    <div className="studio">
      {/* Glisser à gauche / à droite sur l'image change de filtre, en direct. */}
      <div ref={scene} className="studio__image" data-lentille={(actifLentille && lentillePrete) || undefined}
           style={{ "--filtre-camera": filtreCss(filtre) } as React.CSSProperties}
           onPointerDown={(e) => { if (e.target === e.currentTarget || ["VIDEO", "CANVAS"].includes((e.target as HTMLElement).tagName)) glisse.current = { x: e.clientX, y: e.clientY }; }}
           onPointerUp={(e) => {
             const g = glisse.current;
             glisse.current = null;
             if (!g) return;
             const dx = e.clientX - g.x, dy = e.clientY - g.y;
             if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.4) { if (!enCours) decaler(dx < 0 ? 1 : -1); }
             else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) moteur.current?.toucher();
           }}
           onPointerCancel={() => { glisse.current = null; }}>
        <video ref={apercu} className="studio__camera" data-miroir={face === "user" || undefined} muted playsInline autoPlay
               style={{ filter: filtreCss(filtre) }} />
        {vignette && <span className="studio__vignette" style={{ backgroundImage: vignette }} aria-hidden="true" />}
      </div>
      {annonce && <span key={annonce.k} className="studio__annonce" aria-live="polite">{annonce.nom}</span>}
      {actifLentille && !lentillePrete && !erreurLentille && pret && (
        <span className="studio__chargement" aria-live="polite"><span className="reels__chargement" aria-hidden="true" />Chargement de la lentille…</span>
      )}
      {actifLentille && lentillePrete && !annonce && (aideVisible || !visage) && (
        <p className="studio__aide-lentille">{visage ? parCle(lentille)?.aide : "Aucun visage détecté"}</p>
      )}
      {erreurLentille && <p className="studio__aide-lentille" role="alert">{erreurLentille}</p>}

      <div className="studio__haut">
        <div className="studio__jauge" role="progressbar" aria-label="Durée enregistrée"
             aria-valuemin={0} aria-valuemax={DUREE_MAX_S} aria-valuenow={Math.round(total)}>
          <span style={{ width: `${(total / DUREE_MAX_S) * 100}%` }} />
        </div>
        <div className="flex items-center justify-between">
          <button type="button" className="studio__icone" onClick={onQuitter} aria-label="Fermer le studio" disabled={enCours}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
          {enCours || nbSegments > 0 ? (
            <span className={`studio__chrono tabular ${enCours ? "studio__chrono--rec" : ""}`}>
              {formatDuree(total)} / {formatDuree(DUREE_MAX_S)}
            </span>
          ) : (
            <PastilleMusique musique={musique} onClick={() => setFeuilleSon(true)} />
          )}
          <span className="w-11" />
        </div>
        {(enCours || nbSegments > 0) && musique && (
          <div className="mt-2 flex justify-center">
            <PastilleMusique musique={musique} onClick={() => { if (!enCours) setFeuilleSon(true); }} />
          </div>
        )}
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
        <button type="button" className="studio__icone" disabled={enCours || decompte !== null || reste < 1 || !peutAjouter}
                onClick={() => choixFichier.current?.click()} aria-label="Importer une vidéo du téléphone">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3.5" y="4.5" width="17" height="15" rx="3" /><path d="m3.5 16 4.5-4.5 3.5 3.5 2.5-2.5 6.5 6" /><circle cx="15.5" cy="9" r="1.6" />
          </svg>
          <span className="studio__mini">Importer</span>
        </button>
        <button type="button" className="studio__icone" aria-pressed={minuteur} disabled={enCours}
                onClick={() => setMinuteur((m) => !m)} aria-label="Minuteur de 3 secondes">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9.5 2.5h5" />
          </svg>
          <span className="studio__mini">{minuteur ? "3 s" : "Off"}</span>
        </button>
      </div>

      {!musique && nbSegments > 0 && !enCours && (
        <div className="studio__son-libre">
          <PastilleMusique musique={null} onClick={() => setFeuilleSon(true)} />
        </div>
      )}
      {decompte !== null && <span className="studio__decompte" aria-live="assertive">{decompte}</span>}

      {erreur && (
        <div className="studio__erreur" role="alert">
          <p>{erreur}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {reste >= 1 && peutAjouter && (
              <button type="button" className="bouton-principal h-11 px-5" onClick={() => choixFichier.current?.click()}>Importer une vidéo</button>
            )}
            {nbSegments > 0 && (
              <button type="button" className="bouton-principal h-11 px-5" onClick={onSuivant}>Montage</button>
            )}
            <button type="button" className="musique__importer flex-none" onClick={onQuitter}>Retour</button>
          </div>
        </div>
      )}

      {!enCours && decompte === null && (
        <>
          <div className="studio__modes" role="tablist" aria-label="Effets">
            <button type="button" role="tab" aria-selected={mode === "filtres"} onClick={() => setMode("filtres")}>Filtres</button>
            <button type="button" role="tab" aria-selected={mode === "lentilles"} onClick={() => { setMode("lentilles"); moteur.current?.reveiller(); }}>Lentilles</button>
          </div>
          <div ref={bande} key={mode} className="studio__filtres" role="radiogroup" aria-label={mode === "filtres" ? "Filtre" : "Lentille"}>
            {mode === "filtres" ? CLES_FILTRES.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={filtre === k} data-filtre={k}
                      className="studio__filtre" onClick={() => changerFiltre(k)}>
                <span className="studio__filtre-rond" style={{ filter: filtreCss(k), backgroundImage: vignetteCss(k) ? `${vignetteCss(k)}, var(--echantillon)` : undefined }} aria-hidden="true" />
                <span className="studio__filtre-nom">{FILTRES[k].libelle}</span>
              </button>
            )) : CLES_LENTILLES.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={lentille === k} data-filtre={k}
                      className="studio__filtre" onClick={() => changerLentille(k)}>
                <span className="studio__filtre-rond studio__lentille-rond" aria-hidden="true">{parCle(k)?.icone ?? "∅"}</span>
                <span className="studio__filtre-nom">{nomLentille(k)}</span>
              </button>
            ))}
          </div>
        </>
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
          : mode === "lentilles" ? "Touchez pour filmer · glissez pour changer de lentille"
          : "Touchez pour filmer · glissez pour changer de filtre"}
      </p>
      <input ref={choixFichier} type="file" accept="video/*,.mp4,.mov,.webm,.m4v" hidden
             onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onImporter(f); }} />
      {feuilleSon && <FeuilleMusique choisie={musique} onChoisir={onMusique} onFermer={() => setFeuilleSon(false)} />}
    </div>
  );
}
