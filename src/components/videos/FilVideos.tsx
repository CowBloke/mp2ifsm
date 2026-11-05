"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  aimerVideo, commentairesVideo, commenterVideo, marquerVue, supprimerCommentaire, supprimerVideo,
} from "@/lib/actions-videos";
import { formatCompte } from "@/lib/reels";
import type { CommentaireVideo, VideoVue } from "@/lib/videos";

/*
 * Fil vertical des vidéos éducatives, sur le modèle des Réels : une vidéo
 * par écran, défilement aimanté, lecture automatique de la vidéo visible,
 * toucher pour mettre en pause, double toucher pour aimer.
 */

const COEUR = "M12 20.5s-8.5-5-8.5-11A4.75 4.75 0 0 1 12 6.6a4.75 4.75 0 0 1 8.5 2.9c0 6-8.5 11-8.5 11Z";

function ilYa(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "à l’instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) return `il y a ${Math.floor(s / 86400)} j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

type Etat = { likes: number; aime: boolean; commentaires: number };

export function FilVideos({ videos: initiales, moi, admin, pseudo }: {
  videos: VideoVue[]; moi: string; admin: boolean; pseudo: string;
}) {
  const router = useRouter();
  const [videos, setVideos] = useState(initiales);
  const [etats, setEtats] = useState<Record<number, Etat>>(() =>
    Object.fromEntries(initiales.map((v) => [v.id, { likes: v.likes, aime: v.aime, commentaires: v.commentaires }])));
  const [actif, setActif] = useState(0);
  const [son, setSon] = useState(true);
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fil = useRef<HTMLDivElement>(null);
  const sonBloque = useCallback(() => setSon(false), []);

  useEffect(() => {
    const racine = fil.current;
    if (!racine) return;
    const obs = new IntersectionObserver((entrees) => {
      for (const e of entrees) if (e.isIntersecting) setActif(Number((e.target as HTMLElement).dataset.index));
    }, { root: racine, threshold: 0.6 });
    racine.querySelectorAll("[data-index]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [videos.length]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

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
    const reste = videos.filter((x) => x.id !== v.id);
    if (reste.length === 0) { router.push("/divertissement/videos"); return; }
    setVideos(reste);
    setToast("Vidéo supprimée");
  }

  const videoOuverte = videos.find((v) => v.id === ouvert);

  return (
    <div className="reels">
      <header className="reels__haut">
        <Link href="/divertissement/videos" aria-label="Retour aux vidéos" className="reels__retour">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
        </Link>
        <h1 className="flex-1 text-[20px] font-bold tracking-tight">Vidéos</h1>
        <button type="button" className="reels__retour" onClick={() => setSon((s) => !s)}
                aria-label={son ? "Couper le son" : "Activer le son"} aria-pressed={!son}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9v6h4l5 4V5L8 9z" />
            {son ? <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /> : <path d="m17 9 5 6m0-6-5 6" />}
          </svg>
        </button>
        <Link href="/divertissement/videos/nouvelle" aria-label="Enregistrer une vidéo" className="reels__retour">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><path d="M12 8v8M8 12h8" /></svg>
        </Link>
      </header>

      <div ref={fil} className="reels__fil" tabIndex={0} aria-label="Fil de vidéos">
        {videos.map((v, i) => (
          <EcranVideo key={v.id} video={v} index={i} actif={i === actif} proche={Math.abs(i - actif) <= 1}
                      son={son} onSonBloque={sonBloque} etat={etats[v.id]}
                      peutSupprimer={admin || v.auteur_id === moi}
                      onAimer={(force) => aimer(v.id, force)} onCommentaires={() => setOuvert(v.id)}
                      onPartager={() => partager(v)} onSupprimer={() => supprimer(v)} />
        ))}
      </div>

      {videoOuverte && (
        <FeuilleCommentaires video={videoOuverte} moi={moi} admin={admin} pseudo={pseudo}
                             onFermer={() => setOuvert(null)}
                             onNombre={(n) => setEtats((s) => ({ ...s, [videoOuverte.id]: { ...s[videoOuverte.id], commentaires: n } }))} />
      )}
      {toast && <p role="status" className="reels__toast">{toast}</p>}
    </div>
  );
}

function EcranVideo({ video, index, actif, proche, son, onSonBloque, etat, peutSupprimer, onAimer, onCommentaires, onPartager, onSupprimer }: {
  video: VideoVue; index: number; actif: boolean; proche: boolean; son: boolean; onSonBloque: () => void;
  etat: Etat; peutSupprimer: boolean;
  onAimer: (force?: boolean) => void; onCommentaires: () => void; onPartager: () => void; onSupprimer: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [pause, setPause] = useState(false);
  const [progression, setProgression] = useState(0);
  const [details, setDetails] = useState(false);
  const [coeur, setCoeur] = useState<{ x: number; y: number; k: number } | null>(null);
  const vue = useRef(false);
  const dernierTap = useRef(0);
  const minuteurTap = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = !son;
    if (!actif) { el.pause(); return; }
    setPause(false);
    el.play().catch(() => {
      // Lecture avec son refusée (aucun geste encore) : on relance en muet.
      if (!el.muted) { onSonBloque(); el.muted = true; el.play().catch(() => setPause(true)); }
      else setPause(true);
    });
    if (!vue.current) { vue.current = true; marquerVue(video.id); }
  }, [actif, son, onSonBloque, video.id]);

  function basculer() {
    const el = ref.current;
    if (!el) return;
    if (el.paused) { el.play().catch(() => {}); setPause(false); } else { el.pause(); setPause(true); }
  }

  function tap(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, a, input")) return;
    const t = e.timeStamp;
    if (t - dernierTap.current < 300) {
      if (minuteurTap.current) clearTimeout(minuteurTap.current);
      const b = e.currentTarget.getBoundingClientRect();
      setCoeur({ x: e.clientX - b.left, y: e.clientY - b.top, k: t });
      onAimer(true);
      dernierTap.current = 0;
    } else {
      dernierTap.current = t;
      minuteurTap.current = setTimeout(basculer, 280);
    }
  }

  return (
    <section data-index={index} className="reels__ecran videos__ecran" aria-roledescription="vidéo"
             aria-label={`${video.titre}, par ${video.auteur}`} onPointerUp={tap}>
      <video ref={ref} className="videos__lecteur" playsInline loop preload={proche ? "auto" : "none"}
             poster={`/api/videos/${video.id}?couverture=1`}
             src={proche ? `/api/videos/${video.id}` : undefined}
             onTimeUpdate={(e) => {
               const el = e.currentTarget;
               if (el.duration) setProgression(el.currentTime / el.duration);
             }} />
      {pause && (
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

      <div className="reels__actions">
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
      </div>

      <div className="reels__bas">
        <div className="flex items-center gap-2.5">
          <span className="reels__avatar" aria-hidden="true">{video.auteur[0]?.toUpperCase()}</span>
          <span className="min-w-0 truncate text-[15px] font-semibold">{video.auteur}</span>
          <span className="shrink-0 text-[12px] opacity-80">· {ilYa(video.created_at)}</span>
        </div>
        <p className="mt-2 text-[16px] font-semibold leading-snug">{video.titre}</p>
        {video.description && (
          <button type="button" onClick={() => setDetails((d) => !d)} aria-expanded={details}
                  className={`mt-1 block text-left text-[14px] leading-snug ${details ? "videos__desc--ouverte" : "line-clamp-2"}`}>
            {video.description}
          </button>
        )}
        <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px] opacity-90">
          {video.matiere && <span className="videos__etiquette">{video.matiere}</span>}
          <span className="tabular">{formatCompte(video.vues)} vue{video.vues > 1 ? "s" : ""}</span>
        </p>
      </div>

      <div className="reels__progression" aria-hidden="true">
        <span style={{ width: `${progression * 100}%` }} />
      </div>
    </section>
  );
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

  return (
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
              <span className="reels__avatar reels__avatar--petit" aria-hidden="true">{c.auteur[0]?.toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px]"><span className="font-semibold">{c.auteur}</span>
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
    </div>
  );
}
