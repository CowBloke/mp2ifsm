"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  aimerVideo, commentairesVideo, commenterVideo, marquerVue, supprimerCommentaire, supprimerVideo,
} from "@/lib/actions-videos";
import { formatCompte } from "@/lib/reels";
import type { CommentaireVideo, VideoVue } from "@/lib/videos";
import { IconeNote } from "./Musique";

/*
 * Fil vertical des vidéos éducatives, plein écran comme une app de vidéos :
 * une vidéo par écran, défilement aimanté, la vidéo démarre dès qu'elle
 * occupe la moitié de l'écran, toucher = pause, double toucher = j'aime.
 *
 * Lecture fluide : trois éléments <video> seulement, recyclés (écran i →
 * lecteur i mod 3) et déplacés dans le DOM. La précédente, la courante et
 * la suivante sont donc toujours chargées, et sur iPhone le son, débloqué
 * une fois d'un toucher sur chacun des trois lecteurs, le reste pour tout
 * le fil (Safari l'accorde élément par élément).
 */

const COEUR = "M12 20.5s-8.5-5-8.5-11A4.75 4.75 0 0 1 12 6.6a4.75 4.75 0 0 1 8.5 2.9c0 6-8.5 11-8.5 11Z";
const LECTEURS = 3;

function ilYa(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "à l’instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) return `il y a ${Math.floor(s / 86400)} j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

type Etat = { likes: number; aime: boolean; commentaires: number };

const PROFIL = (id: string) => `/divertissement/videos/profil/${id}`;
const SOURCE = (id: number) => `/api/videos/${id}`;
const COUVERTURE = (id: number) => `/api/videos/${id}?couverture=1`;

function creerLecteur(): HTMLVideoElement {
  const v = document.createElement("video");
  v.className = "videos__lecteur";
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  v.setAttribute("webkit-playsinline", "");
  v.loop = true;
  v.preload = "auto";
  v.disablePictureInPicture = true;
  v.setAttribute("disableRemotePlayback", "");
  v.setAttribute("aria-hidden", "true");
  return v;
}

export function FilVideos({ videos: initiales, moi, admin, pseudo, contexte, requete, retour, enMontage }: {
  videos: VideoVue[]; moi: string; admin: boolean; pseudo: string;
  /** « Vidéos de X », nom d'une matière, ou null pour toute la classe. */
  contexte: string | null;
  /** ?auteur=… ou ?matiere=…, repris dans les liens du fil. */
  requete: string;
  retour: string;
  /** Vidéos du membre en cours de montage sur le serveur. */
  enMontage: number;
}) {
  const [videos, setVideos] = useState(initiales);
  const [etats, setEtats] = useState<Record<number, Etat>>(() =>
    Object.fromEntries(initiales.map((v) => [v.id, { likes: v.likes, aime: v.aime, commentaires: v.commentaires }])));
  const [actif, setActif] = useState(0);
  const [son, setSon] = useState(true);
  // Son coupé d'office par le navigateur (aucun geste encore) : un toucher le rétablit.
  const [sonBloque, setSonBloque] = useState(false);
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [lecteurs, setLecteurs] = useState<HTMLVideoElement[] | null>(null);
  const fil = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const els = Array.from({ length: LECTEURS }, creerLecteur);
    setLecteurs(els);
    return () => els.forEach((v) => { v.pause(); v.removeAttribute("src"); v.load(); v.remove(); });
  }, []);

  // Écran actif d'après la position du défilement : bascule dès la mi-hauteur.
  useEffect(() => {
    const racine = fil.current;
    if (!racine) return;
    let image = 0;
    const maj = () => {
      image = 0;
      const i = Math.round(racine.scrollTop / Math.max(1, racine.clientHeight));
      setActif(Math.max(0, Math.min(videos.length - 1, i)));
    };
    const defile = () => { if (!image) image = requestAnimationFrame(maj); };
    racine.addEventListener("scroll", defile, { passive: true });
    window.addEventListener("resize", defile);
    maj();
    return () => { racine.removeEventListener("scroll", defile); window.removeEventListener("resize", defile); cancelAnimationFrame(image); };
  }, [videos.length]);

  // Pas de navigation principale ni de défilement de la page sous le fil.
  useEffect(() => {
    document.documentElement.classList.add("fil-plein-ecran");
    return () => document.documentElement.classList.remove("fil-plein-ecran");
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const aller = useCallback((d: 1 | -1) => {
    const r = fil.current;
    if (r) r.scrollTo({ top: (Math.round(r.scrollTop / r.clientHeight) + d) * r.clientHeight, behavior: "smooth" });
  }, []);

  // Clavier (ordinateur) : ↑/↓ ou j/k pour changer de vidéo, m pour le son.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (ouvert !== null || (e.target as HTMLElement).closest("input, textarea, select")) return;
      if (e.key === "ArrowDown" || e.key === "j" || e.key === "PageDown") { e.preventDefault(); aller(1); }
      else if (e.key === "ArrowUp" || e.key === "k" || e.key === "PageUp") { e.preventDefault(); aller(-1); }
      else if (e.key === "m") setSon((x) => !x);
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [aller, ouvert]);

  /*
   * Appelé pendant un geste (toucher) : rend le son et le débloque sur
   * les trois lecteurs, en jouant/arrêtant aussitôt ceux qui ne sont pas
   * à l'écran (Safari mémorise l'autorisation par élément).
   */
  const debloquerSon = useCallback((courant: HTMLVideoElement | null) => {
    for (const v of lecteurs ?? []) {
      v.muted = false;
      if (v !== courant && v.paused && v.getAttribute("src")) {
        const p = v.play();
        v.pause();
        p?.catch(() => {});
      }
    }
    setSon(true);
    setSonBloque(false);
  }, [lecteurs]);

  const onSonBloque = useCallback(() => setSonBloque(true), []);

  const aimer = useCallback(async (id: number, force?: boolean) => {
    const avant = etats[id];
    const aime = force ?? !avant.aime;
    if (aime === avant.aime) return;
    setEtats((s) => ({ ...s, [id]: { ...avant, aime, likes: avant.likes + (aime ? 1 : -1) } }));
    const r = await aimerVideo(id, aime);
    setEtats((s) => ({ ...s, [id]: { ...s[id], ...(r.ok ? r.data : avant) } }));
  }, [etats]);

  async function partager(v: VideoVue) {
    const url = `${location.origin}/divertissement/videos/${v.id}`;
    try {
      if (navigator.share) { await navigator.share({ title: v.titre, url }); return; }
      await navigator.clipboard.writeText(url);
      setToast("Lien copié");
    } catch { /* partage annulé */ }
  }

  async function supprimer(v: VideoVue) {
    if (!confirm(`Supprimer « ${v.titre} » ? C’est définitif.`)) return;
    const r = await supprimerVideo(v.id);
    if (!r.ok) { setToast(r.erreur); return; }
    setVideos((l) => l.filter((x) => x.id !== v.id));
    setToast("Vidéo supprimée");
  }

  const videoOuverte = videos.find((v) => v.id === ouvert);
  const sonCoupe = !son || sonBloque;

  return (
    <div className="reels videos">
      <header className="reels__haut">
        <Link href={retour} aria-label="Retour" className="reels__retour">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-[18px] font-bold tracking-tight">{contexte ?? "Vidéos"}</h1>
        <button type="button" className="reels__retour"
                onClick={() => { if (sonCoupe) debloquerSon(lecteurs?.[actif % LECTEURS] ?? null); else setSon(false); }}
                aria-label={sonCoupe ? "Activer le son" : "Couper le son"} aria-pressed={sonCoupe}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9v6h4l5 4V5L8 9z" />
            {!sonCoupe ? <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /> : <path d="m17 9 5 6m0-6-5 6" />}
          </svg>
        </button>
      </header>

      {sonBloque && son && videos.length > 0 && (
        <button type="button" className="videos__debloquer" onClick={() => debloquerSon(lecteurs?.[actif % LECTEURS] ?? null)}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" /><path d="m17 9 5 6m0-6-5 6" /></svg>
          Touchez pour activer le son
        </button>
      )}

      {enMontage > 0 && !sonBloque && (
        <Link href={PROFIL("moi")} className="videos__montage">
          <span className="videos__roue videos__roue--clair" aria-hidden="true" />
          {enMontage > 1 ? `${enMontage} vidéos en montage…` : "Votre vidéo est en montage…"}
        </Link>
      )}

      <div ref={fil} className="reels__fil" tabIndex={0} aria-label="Fil de vidéos">
        {videos.length === 0 && (
          <section className="reels__ecran videos__vide">
            <svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1.4"
                 strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2.5" y="6" width="13" height="12" rx="3" /><path d="m15.5 10.5 6-3.5v10l-6-3.5" />
            </svg>
            <p className="mt-4 text-[18px] font-semibold">{contexte ? "Aucune vidéo ici pour l’instant" : "Aucune vidéo pour l’instant"}</p>
            <p className="mt-2 max-w-[280px] text-[14px] leading-snug opacity-80">
              Une démo, une méthode, un exercice corrigé : touchez + pour filmer la première.
            </p>
          </section>
        )}
        {videos.map((v, i) => (
          <EcranVideo key={v.id} video={v} index={i} actif={i === actif}
                      lecteur={lecteurs && Math.abs(i - actif) <= 1 ? lecteurs[i % LECTEURS] : null}
                      suivant={i === actif + 1}
                      son={son && !sonBloque} sonBloque={sonBloque} onSonBloque={onSonBloque} onDebloquer={debloquerSon}
                      etat={etats[v.id]}
                      peutSupprimer={admin || v.auteur_id === moi}
                      onAimer={(force) => aimer(v.id, force)} onCommentaires={() => setOuvert(v.id)}
                      onPartager={() => partager(v)} onSupprimer={() => supprimer(v)} />
        ))}
      </div>

      <nav className="videos__barre" aria-label="Vidéos">
        <Link href="/divertissement/videos" aria-current={!requete ? "page" : undefined} className="videos__onglet">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="2.5" width="14" height="19" rx="3" /><path d="m10.5 9.5 4 2.5-4 2.5z" /></svg>
          Fil
        </Link>
        <Link href="/divertissement/videos/nouvelle" aria-label="Créer une vidéo" className="videos__plus">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2"
               strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </Link>
        <Link href={PROFIL("moi")} className="videos__onglet">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8.5" r="4" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></svg>
          Profil
        </Link>
      </nav>

      {videoOuverte && (
        <FeuilleCommentaires video={videoOuverte} moi={moi} admin={admin} pseudo={pseudo}
                             onFermer={() => setOuvert(null)}
                             onNombre={(n) => setEtats((s) => ({ ...s, [videoOuverte.id]: { ...s[videoOuverte.id], commentaires: n } }))} />
      )}
      {toast && <p role="status" className="reels__toast">{toast}</p>}
    </div>
  );
}

function EcranVideo({ video, index, actif, lecteur, suivant, son, sonBloque, onSonBloque, onDebloquer, etat, peutSupprimer, onAimer, onCommentaires, onPartager, onSupprimer }: {
  video: VideoVue; index: number; actif: boolean;
  /** Lecteur recyclé prêté à cet écran (précédent, courant ou suivant), sinon null. */
  lecteur: HTMLVideoElement | null;
  suivant: boolean;
  son: boolean; sonBloque: boolean; onSonBloque: () => void; onDebloquer: (courant: HTMLVideoElement | null) => void;
  etat: Etat; peutSupprimer: boolean;
  onAimer: (force?: boolean) => void; onCommentaires: () => void; onPartager: () => void; onSupprimer: () => void;
}) {
  const hote = useRef<HTMLDivElement>(null);
  const barre = useRef<HTMLSpanElement>(null);
  const [pause, setPause] = useState(false);
  const [attente, setAttente] = useState(false);
  const [paysage, setPaysage] = useState(false);
  const [pret, setPret] = useState(false);
  const [details, setDetails] = useState(false);
  const [coeur, setCoeur] = useState<{ x: number; y: number; k: number } | null>(null);
  const [glisse, setGlisse] = useState<number | null>(null);
  const vue = useRef(false);
  const actifRef = useRef(actif);
  actifRef.current = actif;
  const dernierTap = useRef(0);
  const minuteurTap = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Installe le lecteur prêté dans cet écran, sur la bonne vidéo.
  useLayoutEffect(() => {
    const el = lecteur, h = hote.current;
    if (!el || !h) { setPret(false); return; }
    const src = SOURCE(video.id);
    if (el.dataset.video !== String(video.id)) {
      el.dataset.video = String(video.id);
      el.pause();
      el.poster = COUVERTURE(video.id);
      el.src = src;
      el.load();
    }
    if (el.parentElement !== h) h.prepend(el);
    const format = () => {
      if (el.videoWidth) setPaysage(el.videoWidth > el.videoHeight);
      setPret(el.readyState >= 2);
    };
    const attendre = () => { if (actifRef.current) setAttente(true); };
    const joue = () => { setAttente(false); setPret(true); };
    format();
    el.addEventListener("loadedmetadata", format);
    el.addEventListener("loadeddata", format);
    el.addEventListener("waiting", attendre);
    el.addEventListener("playing", joue);
    el.addEventListener("canplay", joue);
    return () => {
      el.removeEventListener("loadedmetadata", format);
      el.removeEventListener("loadeddata", format);
      el.removeEventListener("waiting", attendre);
      el.removeEventListener("playing", joue);
      el.removeEventListener("canplay", joue);
    };
  }, [lecteur, video.id]);

  // Lecture de l'écran actif ; les autres s'arrêtent et reviennent au début.
  useEffect(() => {
    const el = lecteur;
    if (!el || el.dataset.video !== String(video.id)) return;
    if (!actif) {
      el.pause();
      setAttente(false);
      if (el.currentTime > 0) { try { el.currentTime = 0; } catch { /* pas encore chargée */ } }
      return;
    }
    el.muted = !son;
    setPause(false);
    el.play().catch((e: DOMException) => {
      if (e.name === "AbortError") return;
      // Lecture avec son refusée (aucun geste encore) : on relance en muet.
      if (!el.muted) { onSonBloque(); el.muted = true; el.play().catch(() => setPause(true)); }
      else setPause(true);
    });
    if (!vue.current) { vue.current = true; marquerVue(video.id); }
  }, [actif, son, lecteur, onSonBloque, video.id]);

  // La suivante se charge en avance (Safari ne précharge qu'après un play muet).
  useEffect(() => {
    const el = lecteur;
    if (!el || !suivant || el.dataset.video !== String(video.id) || el.readyState >= 2) return;
    const t = setTimeout(() => {
      if (actifRef.current || !el.paused) return;
      el.muted = true;
      el.play().then(() => { if (!actifRef.current) { el.pause(); el.currentTime = 0; } }).catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [lecteur, suivant, video.id]);

  // Barre de progression fluide (une image sur deux suffit) pour l'écran actif.
  useEffect(() => {
    const el = lecteur;
    if (!actif || !el) return;
    let id = 0;
    const pas = () => {
      if (barre.current && el.duration && glisse === null) barre.current.style.transform = `scaleX(${el.currentTime / el.duration})`;
      id = requestAnimationFrame(pas);
    };
    id = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(id);
  }, [actif, lecteur, glisse]);

  function basculer() {
    const el = lecteur;
    if (!el) return;
    if (el.paused) { el.play().catch(() => {}); setPause(false); } else { el.pause(); setPause(true); }
  }

  function tap(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, a, input, .videos__temps")) return;
    // Premier toucher alors que le navigateur a coupé le son : on le rend, sans mettre en pause.
    if (sonBloque) { onDebloquer(lecteur); return; }
    const t = e.timeStamp;
    if (t - dernierTap.current < 300) {
      if (minuteurTap.current) clearTimeout(minuteurTap.current);
      const b = e.currentTarget.getBoundingClientRect();
      setCoeur({ x: e.clientX - b.left, y: e.clientY - b.top, k: t });
      onAimer(true);
      dernierTap.current = 0;
    } else {
      dernierTap.current = t;
      minuteurTap.current = setTimeout(basculer, 260);
    }
  }

  // Glisser sur la barre de temps pour avancer / reculer.
  function chercher(e: React.PointerEvent<HTMLDivElement>, fin = false) {
    const el = lecteur;
    if (!el?.duration) return;
    const b = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - b.left) / b.width));
    if (barre.current) barre.current.style.transform = `scaleX(${x})`;
    setGlisse(fin ? null : x * el.duration);
    if (fin) { el.currentTime = x * el.duration; if (el.paused && !pause) el.play().catch(() => {}); }
  }

  return (
    <section data-index={index} className="reels__ecran videos__ecran" aria-roledescription="vidéo"
             aria-label={`${video.titre}, par ${video.auteur}`} onPointerUp={tap}>
      {/* Couverture floutée derrière une vidéo en paysage, et tant que la vidéo charge. */}
      <div className="videos__fond" style={{ backgroundImage: `url(${COUVERTURE(video.id)})` }} data-paysage={paysage || undefined} aria-hidden="true" />
      {!pret && <img className="videos__affiche" src={COUVERTURE(video.id)} alt="" loading={Math.abs(index) < 3 ? "eager" : "lazy"} aria-hidden="true" />}
      <div ref={hote} className="videos__hote" data-paysage={paysage || undefined} />
      {(attente || (actif && !pret && !!lecteur)) && <span className="reels__chargement videos__attente" aria-hidden="true" />}
      {pause && !attente && (
        <span className="videos__pause" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="64" height="64"><path d="M8 5.5v13l10.5-6.5z" fill="#fff" /></svg>
        </span>
      )}
      {coeur && (
        <svg key={coeur.k} className="reels__coeur-geant" style={{ left: coeur.x, top: coeur.y }}
             viewBox="0 0 24 24" width="110" height="110" aria-hidden="true" onAnimationEnd={() => setCoeur(null)}>
          <path d={COEUR} fill="#ff3040" />
        </svg>
      )}

      <div className="reels__actions videos__actions" data-masque={glisse !== null || undefined}>
        <Link href={PROFIL(video.auteur_id)} className="reels__avatar videos__avatar-action" aria-label={`Profil de ${video.auteur}`}>
          {video.auteur[0]?.toUpperCase()}
        </Link>
        <Action label={etat.aime ? "Je n’aime plus" : "J’aime"} compte={etat.likes} presse={etat.aime} onClick={() => onAimer()}>
          <path d={COEUR} fill={etat.aime ? "#ff3040" : "none"} stroke={etat.aime ? "#ff3040" : "currentColor"} />
        </Action>
        <Action label="Commentaires" compte={etat.commentaires} onClick={onCommentaires}>
          <path d="M20.5 11.5a8.5 8.5 0 0 1-12.4 7.5L3.5 20.5 5 16a8.5 8.5 0 1 1 15.5-4.5Z" fill="none" stroke="currentColor" />
        </Action>
        <Action label="Partager" onClick={onPartager}>
          <path d="M21.5 3 10 14M21.5 3l-7 18-4.5-7-7-4.5z" fill="none" stroke="currentColor" />
        </Action>
        {peutSupprimer && (
          <Action label="Supprimer la vidéo" onClick={onSupprimer}>
            <path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13" fill="none" stroke="currentColor" />
          </Action>
        )}
        {video.musique && (
          <span className="musique__disque videos__disque" data-tourne={(actif && !pause) || undefined} aria-hidden="true">
            <IconeNote taille={14} />
          </span>
        )}
      </div>

      <div className="reels__bas" data-masque={glisse !== null || undefined}>
        <div className="flex items-center gap-2.5">
          <Link href={PROFIL(video.auteur_id)} className="videos__auteur" aria-label={`Profil de ${video.auteur}`}>
            <span className="min-w-0 truncate text-[16px] font-bold">{video.auteur}</span>
          </Link>
          <span className="shrink-0 text-[12px] opacity-80">· {ilYa(video.created_at)}</span>
        </div>
        <p className="mt-1.5 text-[15px] font-semibold leading-snug">{video.titre}</p>
        {video.description && (
          <button type="button" onClick={() => setDetails((d) => !d)} aria-expanded={details}
                  className={`mt-1 text-left text-[14px] leading-snug ${details ? "videos__desc--ouverte block" : "line-clamp-2"}`}>
            {video.description}
          </button>
        )}
        <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px] opacity-90">
          {video.matiere && video.matiere_id !== null && (
            <Link href={`/divertissement/videos?matiere=${video.matiere_id}`} className="videos__etiquette">{video.matiere}</Link>
          )}
          <span className="tabular">{formatCompte(video.vues)} vue{video.vues > 1 ? "s" : ""}</span>
        </p>
        {video.musique && (
          <p className="mt-2 flex items-center gap-1.5 text-[13px]">
            <IconeNote taille={13} />
            <span className="reels__son"><span>{video.musique}</span><span aria-hidden="true">{video.musique}</span></span>
          </p>
        )}
      </div>

      {glisse !== null && (
        <span className="videos__chrono tabular" aria-hidden="true">
          {format(glisse)} / {format(lecteur?.duration ?? 0)}
        </span>
      )}
      <div className="videos__temps" data-glisse={glisse !== null || undefined}
           onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); chercher(e); }}
           onPointerMove={(e) => { if (glisse !== null) chercher(e); }}
           onPointerUp={(e) => chercher(e, true)}
           onPointerCancel={() => setGlisse(null)}
           role="slider" aria-label="Position dans la vidéo" aria-valuemin={0} aria-valuemax={100}
           aria-valuenow={0} tabIndex={-1}>
        <span ref={barre} />
      </div>
    </section>
  );
}

function format(s: number): string {
  const t = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

function Action({ label, compte, presse, onClick, children }: {
  label: string; compte?: number; presse?: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={compte === undefined ? label : `${label} (${compte})`}
            aria-pressed={presse} className="reels__action">
      <svg viewBox="0 0 24 24" width="30" height="30" strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round"
           aria-hidden="true" className={presse ? "reels__pop" : undefined}>{children}</svg>
      {compte !== undefined && <span className="text-[12px] font-semibold tabular">{formatCompte(compte)}</span>}
    </button>
  );
}

function FeuilleCommentaires({ video, moi, admin, pseudo, onFermer, onNombre }: {
  video: VideoVue; moi: string; admin: boolean; pseudo: string;
  onFermer: () => void; onNombre: (n: number) => void;
}) {
  const [liste, setListe] = useState<CommentaireVideo[] | null>(null);
  const [texte, setTexte] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    commentairesVideo(video.id).then((r) => { if (r.ok) setListe(r.data); else setErreur(r.erreur); });
  }, [video.id]);

  useEffect(() => {
    const touche = (e: KeyboardEvent) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [onFermer]);

  function appliquer(r: Awaited<ReturnType<typeof commenterVideo>>) {
    if (r.ok) { setListe(r.data); onNombre(r.data.length); setErreur(null); } else setErreur(r.erreur);
  }

  // Portail vers <body> : la feuille doit passer au-dessus de la navigation basse.
  return createPortal(
    <div className="reels__voile" onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="videos-commentaires" className="reels__feuille">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-[var(--border)]" aria-hidden="true" />
        <h2 id="videos-commentaires" className="w-full text-center text-[15px] font-semibold">Commentaires</h2>
        <button type="button" onClick={onFermer} aria-label="Fermer"
                className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-[20px] hover:bg-[var(--muted)]">×</button>
        <ul className="mt-3 flex-1 space-y-4 overflow-y-auto px-1 pb-2">
          {liste === null && !erreur && <li className="text-center text-[14px] text-[var(--muted-foreground)]">Chargement…</li>}
          {liste?.length === 0 && (
            <li className="pt-6 text-center text-[14px] text-[var(--muted-foreground)]">
              Pas encore de commentaire. Une question sur l’explication ?
            </li>
          )}
          {liste?.map((c) => (
            <li key={c.id} className="flex gap-3">
              <Link href={PROFIL(c.auteur_id)} className="reels__avatar reels__avatar--petit" aria-label={`Profil de ${c.auteur}`}>
                {c.auteur[0]?.toUpperCase()}
              </Link>
              <div className="min-w-0 flex-1">
                <p className="text-[13px]"><Link href={PROFIL(c.auteur_id)} className="font-semibold text-[var(--foreground)] hover:underline">{c.auteur}</Link>
                  <span className="ml-2 text-[var(--muted-foreground)]">{ilYa(c.created_at)}</span></p>
                <p className="whitespace-pre-line text-[14px] leading-snug [overflow-wrap:anywhere]">{c.texte}</p>
              </div>
              {(admin || c.auteur_id === moi || video.auteur_id === moi) && (
                <button type="button" aria-label="Supprimer ce commentaire"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                        onClick={async () => appliquer(await supprimerCommentaire(c.id))}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9"
                       strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13" /></svg>
                </button>
              )}
            </li>
          ))}
        </ul>
        {erreur && <p role="alert" className="pb-2 text-[13px] text-[var(--destructive)]">{erreur}</p>}
        <form className="flex gap-2 border-t border-[var(--hairline)] pt-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const t = texte.trim();
                if (!t || envoi) return;
                setEnvoi(true);
                const r = await commenterVideo(video.id, t);
                setEnvoi(false);
                appliquer(r);
                if (r.ok) setTexte("");
              }}>
          <input value={texte} onChange={(e) => setTexte(e.target.value)} maxLength={500}
                 placeholder={`Commenter en tant que ${pseudo}…`} aria-label="Ajouter un commentaire"
                 className="champ min-h-[44px] flex-1 rounded-full" />
          <button type="submit" disabled={!texte.trim() || envoi} className="lien-discret px-2 disabled:opacity-40">Publier</button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
