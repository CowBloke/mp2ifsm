"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MUSIQUES, TAILLE_MAX_MUSIQUE, formatDuree } from "@/lib/videos-montage";

/*
 * Choix de la musique d'une vidéo, comme le « Sons » des apps de vidéos :
 * une bibliothèque de morceaux libres (générés par le portail) qu'on
 * écoute d'un toucher, ou un fichier audio du téléphone. Le mixage se fait
 * au rendu ; ici on ne garde que le choix et un lien d'écoute.
 */

export type MusiqueChoisie = {
  cle: string; // clé de la bibliothèque, ou « perso »
  titre: string;
  url: string; // écoute (fichier public ou blob:)
  duree: number;
  debut: number;
  volume: number;
  voix: number;
  fichier?: Blob;
};

export const urlMusique = (cle: string) => `/musique/${cle}.m4a`;

export function musiqueBibliotheque(cle: string): MusiqueChoisie {
  const m = MUSIQUES[cle];
  return { cle, titre: m.titre, url: urlMusique(cle), duree: m.duree, debut: 0, volume: 0.6, voix: 1 };
}

const NOTE = "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z";

export function IconeNote({ taille = 16 }: { taille?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={taille} height={taille} fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={NOTE} /></svg>
  );
}

/** Lit la durée d'un fichier audio ; null s'il n'est pas lisible ici. */
function dureeAudio(url: string): Promise<number | null> {
  return new Promise((ok) => {
    const a = new Audio();
    const fin = (d: number | null) => { a.removeAttribute("src"); ok(d); };
    a.preload = "metadata";
    a.onloadedmetadata = () => fin(Number.isFinite(a.duration) && a.duration > 0 ? a.duration : null);
    a.onerror = () => fin(null);
    setTimeout(() => fin(null), 8000);
    a.src = url;
  });
}

/**
 * Feuille « Ajouter un son » : bibliothèque + import. Écoute d'un
 * toucher sur la pochette, choix d'un toucher sur la ligne.
 */
export function FeuilleMusique({ choisie, onChoisir, onFermer }: {
  choisie: MusiqueChoisie | null;
  onChoisir: (m: MusiqueChoisie | null) => void;
  onFermer: () => void;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [ecoute, setEcoute] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [import_, setImport] = useState(false);
  const fichier = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const a = new Audio();
    a.loop = true;
    audio.current = a;
    return () => { a.pause(); a.removeAttribute("src"); };
  }, []);

  useEffect(() => {
    const touche = (e: KeyboardEvent) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [onFermer]);

  function ecouter(cle: string) {
    const a = audio.current;
    if (!a) return;
    if (ecoute === cle) { a.pause(); setEcoute(null); return; }
    a.src = urlMusique(cle);
    a.currentTime = 0;
    a.play().then(() => setEcoute(cle)).catch(() => setEcoute(null));
  }

  async function importer(f: File) {
    setErreur(null);
    if (f.size > TAILLE_MAX_MUSIQUE) { setErreur("Fichier trop lourd (15 Mo au plus)."); return; }
    setImport(true);
    const url = URL.createObjectURL(f);
    const duree = await dureeAudio(url);
    setImport(false);
    if (!duree) { URL.revokeObjectURL(url); setErreur("Ce fichier audio n’est pas lisible. Essayez un MP3 ou un M4A."); return; }
    const titre = f.name.replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[_-]+/g, " ").trim().slice(0, 80) || "Mon son";
    audio.current?.pause();
    onChoisir({ cle: "perso", titre, url, duree, debut: 0, volume: 0.7, voix: 1, fichier: f });
    onFermer();
  }

  return createPortal(
    <div className="reels__voile musique__voile" onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="musique-titre" className="reels__feuille musique__feuille">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/25" aria-hidden="true" />
        <h2 id="musique-titre" className="w-full text-center text-[15px] font-semibold">Ajouter un son</h2>
        <button type="button" onClick={onFermer} aria-label="Fermer"
                className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-[20px] hover:bg-white/10">×</button>

        <ul className="mt-4 flex-1 space-y-1 overflow-y-auto">
          {Object.entries(MUSIQUES).map(([cle, m], i) => {
            const choisi = choisie?.cle === cle;
            return (
              <li key={cle} className="musique__ligne" data-choisi={choisi || undefined}>
                <button type="button" className="musique__pochette" style={{ "--h": 40 + i * 62 } as React.CSSProperties}
                        onClick={() => ecouter(cle)} aria-label={ecoute === cle ? `Arrêter l’écoute de ${m.titre}` : `Écouter ${m.titre}`}>
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                    {ecoute === cle ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="#fff" /> : <path d="M8 5.5v13l10.5-6.5z" fill="#fff" />}
                  </svg>
                  {ecoute === cle && <span className="musique__onde" aria-hidden="true"><i /><i /><i /></span>}
                </button>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => {
                  audio.current?.pause(); setEcoute(null);
                  onChoisir(choisi ? null : musiqueBibliotheque(cle));
                  if (!choisi) onFermer();
                }}>
                  <span className="block truncate text-[15px] font-semibold">{m.titre}</span>
                  <span className="block truncate text-[12px] opacity-70">{m.ambiance} · {formatDuree(m.duree)} en boucle</span>
                </button>
                <span className="musique__coche" aria-hidden="true">{choisi ? "✓" : "+"}</span>
              </li>
            );
          })}
        </ul>

        {erreur && <p role="alert" className="pb-2 text-[13px] text-[#ff6b6b]">{erreur}</p>}
        <div className="flex gap-2 border-t border-white/10 pt-3">
          <button type="button" className="musique__importer" onClick={() => fichier.current?.click()} disabled={import_}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                 strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M4 15v5h16v-5" /></svg>
            {import_ ? "Lecture du fichier…" : choisie?.cle === "perso" ? `Remplacer « ${choisie.titre} »` : "Importer depuis le téléphone"}
          </button>
          {choisie && (
            <button type="button" className="musique__retirer" onClick={() => { onChoisir(null); onFermer(); }}>Sans son</button>
          )}
        </div>
        <input ref={fichier} type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac" hidden
               onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importer(f); }} />
        <p className="pt-2 text-[11px] leading-snug opacity-55">
          Les morceaux de la bibliothèque sont libres. Pour un fichier importé, n’utilisez que de la musique que vous avez le droit de partager.
        </p>
      </div>
    </div>,
    document.body,
  );
}

/** Pastille « ♪ Ajouter un son » (caméra, éditeur). */
export function PastilleMusique({ musique, onClick, className = "" }: {
  musique: MusiqueChoisie | null; onClick: () => void; className?: string;
}) {
  return (
    <button type="button" onClick={onClick} className={`musique__pastille ${className}`}
            aria-label={musique ? `Son : ${musique.titre}. Changer de son` : "Ajouter un son"}>
      <IconeNote taille={15} />
      <span className="musique__pastille-texte">{musique ? musique.titre : "Ajouter un son"}</span>
    </button>
  );
}
