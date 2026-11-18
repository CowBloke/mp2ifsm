"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { JEUX } from "@/components/divertissement/jeux";
import { PALETTE, TAILLE, type HistoriqueToile } from "@/lib/place/commun";

/*
 * Timelapse de La Toile (administrateurs) : rejoue tout place_log.
 * Deux rythmes : « constant » (chaque pixel prend le même temps) ou
 * « chronologique » (proportionnel à l'heure réelle, les nuits creuses
 * passent donc vite… ou longtemps sans rien, selon la durée choisie).
 * Les pixels annulés par la modération peuvent être masqués : la
 * restauration qui a suivi les recouvre de toute façon.
 */

const RGB = PALETTE.map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)));
const DUREES = [10, 30, 60, 120, 300] as const;
const PAR = 5; // nombres par événement dans `evenements`

type Rythme = "constant" | "chrono";

const dateHeure = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
});

export function Timelapse() {
  const [donnees, setDonnees] = useState<HistoriqueToile | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [position, setPosition] = useState(1); // 0..1 : avancement du film
  const [lecture, setLecture] = useState(false);
  const [duree, setDuree] = useState<number>(30);
  const [rythme, setRythme] = useState<Rythme>("constant");
  const [masquerAnnules, setMasquerAnnules] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Toile rejouée jusqu'à `applique` événements (exclu). */
  const toile = useRef(new Uint8Array(TAILLE * TAILLE));
  const applique = useRef(0);
  /** Filtre avec lequel `toile` a été rejouée. */
  const filtre = useRef<{ d: HistoriqueToile | null; masquer: boolean }>({ d: null, masquer: false });
  const positionRef = useRef(position);
  positionRef.current = position;

  useEffect(() => {
    let annule = false;
    fetch("/api/toile/timelapse", { cache: "no-store" })
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.erreur || "Historique indisponible");
        if (!annule) setDonnees(d);
      })
      .catch(err => { if (!annule) setErreur(err instanceof Error ? err.message : "Historique indisponible"); });
    return () => { annule = true; };
  }, []);

  const n = donnees ? donnees.evenements.length / PAR : 0;
  const etendue = donnees && n > 0 ? donnees.evenements[(n - 1) * PAR + 4] : 0;

  /** Nombre d'événements montrés à la position p. */
  const cible = useCallback((p: number): number => {
    if (!donnees || n === 0 || !(p > 0)) return 0;
    if (p >= 1) return n;
    if (rythme === "constant" || etendue === 0) return Math.floor(p * n);
    // Chronologique : premier événement dont l'instant dépasse p × étendue.
    const limite = p * etendue;
    let bas = 0, haut = n;
    while (bas < haut) {
      const m = (bas + haut) >> 1;
      if (donnees.evenements[m * PAR + 4] <= limite) bas = m + 1; else haut = m;
    }
    return bas;
  }, [donnees, n, rythme, etendue]);

  const montres = cible(position);

  // Rejoue jusqu'à `montres`, en repartant de zéro si l'on recule.
  useEffect(() => {
    if (!donnees) return;
    const ev = donnees.evenements;
    if (montres < applique.current || filtre.current.d !== donnees || filtre.current.masquer !== masquerAnnules) {
      filtre.current = { d: donnees, masquer: masquerAnnules };
      toile.current.fill(0);
      applique.current = 0;
    }
    for (let i = applique.current; i < montres; i++) {
      const o = i * PAR;
      if (masquerAnnules && ev[o + 3]) continue;
      toile.current[ev[o + 1] * TAILLE + ev[o]] = ev[o + 2];
    }
    applique.current = montres;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(TAILLE, TAILLE);
    toile.current.forEach((c, i) => {
      const [r, g, b] = RGB[c] ?? RGB[0];
      img.data.set([r, g, b, 255], i * 4);
    });
    ctx.putImageData(img, 0, 0);
  }, [donnees, montres, masquerAnnules]);

  // Lecture : avance la position au rythme de la durée choisie.
  useEffect(() => {
    if (!lecture) return;
    let precedent = performance.now();
    let id = requestAnimationFrame(function pas(t) {
      // Le premier horodatage peut précéder performance.now() : jamais de recul.
      const dt = Math.max(0, t - precedent) / 1000;
      precedent = t;
      const suivant = Math.min(1, positionRef.current + dt / duree);
      positionRef.current = suivant;
      setPosition(suivant);
      if (suivant >= 1) setLecture(false);
      else id = requestAnimationFrame(pas);
    });
    return () => cancelAnimationFrame(id);
  }, [lecture, duree]);

  function basculer() {
    if (!lecture && position >= 1) setPosition(0);
    setLecture(l => !l);
  }

  const instant = useMemo(() => {
    if (!donnees || montres === 0) return null;
    return new Date((donnees.debut + donnees.evenements[(montres - 1) * PAR + 4]) * 1000);
  }, [donnees, montres]);

  const Icone = JEUX.toile.Icone;

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/divertissement/toile" aria-label="Retour à La Toile"
              className="-ml-2 grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-[var(--muted)]">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 6-6 6 6 6" />
          </svg>
        </Link>
        <Icone />
        <h1 className="jeu-titre">Timelapse</h1>
        <span className="ml-auto text-[13px] text-[var(--muted-foreground)]">Administrateurs</span>
      </div>

      <div className="relative aspect-square w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--muted)]">
        <canvas ref={canvasRef} width={TAILLE} height={TAILLE} className="h-full w-full"
                style={{ imageRendering: "pixelated" }} aria-label="Toile rejouée" />
        {!donnees && (
          <div className="absolute inset-0 grid place-items-center text-[14px] text-[var(--muted-foreground)]">
            {erreur ?? "Chargement de l’historique…"}
          </div>
        )}
        {donnees && n === 0 && (
          <div className="absolute inset-0 grid place-items-center text-[14px] text-[var(--muted-foreground)]">
            Aucun pixel posé pour l’instant
          </div>
        )}
      </div>

      {donnees && n > 0 && (
        <>
          <div className="flex items-center gap-3">
            <button type="button" onClick={basculer}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]"
                    aria-label={lecture ? "Pause" : "Lecture"}>
              {lecture ? (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                  <rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                  <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
                </svg>
              )}
            </button>
            <input type="range" className="w-full accent-[var(--primary)]" min={0} max={1} step={0.0005}
                   value={position} aria-label="Avancement"
                   onChange={e => { setLecture(false); setPosition(Number(e.target.value)); }} />
          </div>

          <p className="m-0 text-[14px] tabular-nums text-[var(--muted-foreground)]" aria-live="off">
            {instant ? dateHeure.format(instant) : "Toile vierge"} · {montres.toLocaleString("fr-FR")} / {n.toLocaleString("fr-FR")} changements
          </p>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-[14px]">
            <label className="flex items-center gap-2">
              Durée
              <select value={duree} onChange={e => setDuree(Number(e.target.value))}
                      className="rounded-[var(--radius-sm)] border border-[var(--hairline)] bg-transparent px-2 py-1">
                {DUREES.map(d => <option key={d} value={d}>{d < 60 ? `${d} s` : `${d / 60} min`}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2">
              Rythme
              <select value={rythme} onChange={e => setRythme(e.target.value as Rythme)}
                      className="rounded-[var(--radius-sm)] border border-[var(--hairline)] bg-transparent px-2 py-1">
                <option value="constant">Constant (par pixel)</option>
                <option value="chrono">Chronologique</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={masquerAnnules} onChange={e => setMasquerAnnules(e.target.checked)}
                     className="h-4 w-4 accent-[var(--primary)]" />
              Masquer les pixels annulés
            </label>
          </div>
        </>
      )}
    </div>
  );
}
