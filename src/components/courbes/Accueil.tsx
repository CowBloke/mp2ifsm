"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SalonOuvert } from "@/lib/courbes/vue";
import { Regles } from "./Salle";

const BASE = "/divertissement/curve-fight";
const PHASES: Record<SalonOuvert["phase"], string> = {
  salon: "En attente", preparation: "En partie", volee: "En partie", finManche: "En partie", fin: "Partie finie",
};

/** Le jeu en une figure : deux joueurs, une courbe qui part de l'un et atteint l'autre. */
function Figure() {
  // y = 26·sin(x/38) sur un repère de 320 × 120, origine au centre.
  const points = Array.from({ length: 41 }, (_, i) => {
    const x = 60 + i * 5;
    return `${x},${(60 - 26 * Math.sin((x - 160) / 38)).toFixed(1)}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 320 120" className="cf-figure" role="img"
         aria-label="Deux joueurs dans un repère ; la courbe de l’un rejoint l’autre.">
      <defs>
        <pattern id="cf-carreaux" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" stroke="currentColor" strokeOpacity="0.1" />
        </pattern>
      </defs>
      <rect width="320" height="120" fill="url(#cf-carreaux)" />
      <path d="M0 60h320M160 0v120" stroke="currentColor" strokeOpacity="0.55" />
      <circle cx="118" cy="34" r="17" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeOpacity="0.6" />
      <polyline points={points} fill="none" stroke="var(--cf-j1)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <g style={{ color: "var(--cf-j1)" }}>
        <circle cx="60" cy="72.7" r="8" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="2" />
        <circle cx="60" cy="72.7" r="2.5" fill="currentColor" />
      </g>
      <g style={{ color: "var(--cf-j0)" }}>
        <circle cx="260" cy="47.3" r="8" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="260" cy="47.3" r="2.5" fill="currentColor" />
      </g>
    </svg>
  );
}

export function Accueil({ salons: initiaux }: { salons: SalonOuvert[] }) {
  const router = useRouter();
  const [salons, setSalons] = useState(initiaux);
  const [code, setCode] = useState("");
  const [creation, setCreation] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const codeValide = /^[A-Z0-9]{4}$/.test(code);

  useEffect(() => {
    const id = setInterval(async () => {
      if (document.hidden) return;
      try {
        const r = await fetch("/api/courbes/salons", { cache: "no-store" });
        if (r.ok) setSalons((await r.json()).salons);
      } catch { /* prochain passage */ }
    }, 4000);
    return () => clearInterval(id);
  }, []);

  async function creer() {
    setCreation(true);
    setErreur(null);
    try {
      const r = await fetch("/api/courbes/salons", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.erreur);
      router.push(`${BASE}/salon/${d.code}`);
    } catch (err) {
      setErreur(err instanceof Error && err.message ? err.message : "Création impossible");
      setCreation(false);
    }
  }

  return (
    <div className="page-stack">
      <Figure />

      <section className="flex flex-col gap-3">
        <button type="button" className="bouton-principal" onClick={creer} disabled={creation}>
          {creation ? "Création…" : "Créer un salon"}
        </button>
        {erreur && <p role="alert" className="text-[14px] font-medium text-[var(--destructive)]">{erreur}</p>}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (codeValide) router.push(`${BASE}/salon/${code}`); }}>
          <input className="champ min-w-0 flex-1 font-mono uppercase tracking-[0.2em]" value={code}
                 onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
                 placeholder="Code" aria-label="Code du salon à rejoindre" autoComplete="off" autoCapitalize="characters" spellCheck={false} />
          <button type="submit" className="puce !h-12 !px-5" disabled={!codeValide}>Rejoindre</button>
        </form>
      </section>

      <section>
        <h2 className="etiquette">Salons ouverts</h2>
        {salons.length === 0 ? (
          <p className="py-3 text-[15px] text-[var(--muted-foreground)]">Aucun pour l’instant. Ouvre le premier ; seul, tu peux y ajouter des bots.</p>
        ) : (
          <ul>
            {salons.map((s) => (
              <li key={s.code}>
                <Link href={`${BASE}/salon/${s.code}`} className="ligne">
                  <span className="w-[4.5ch] font-mono text-[16px] font-semibold tracking-[0.08em]">{s.code}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate ligne__titre">Salon de {s.hote}</span>
                    <span className="block ligne__meta">
                      {s.mode === "brouillard" ? "Brouillard" : "Classique"} · {s.tir === "equadiff" ? "y′ = f(x, y)" : "y = f(x)"} · {s.joueurs} joueur{s.joueurs > 1 ? "s" : ""}
                    </span>
                  </span>
                  <span className="ligne__meta">{s.phase === "salon" ? "Rejoindre" : `${PHASES[s.phase]} · regarder`}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <Link href={`${BASE}/classement`} className="ligne">
          <span className="min-w-0 flex-1">
            <span className="block ligne__titre">Classement</span>
            <span className="block ligne__meta">Meilleurs joueurs, plus beaux tirs, fonctions fétiches</span>
          </span>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-[var(--muted-foreground)]">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </Link>
        <Regles />
      </section>
    </div>
  );
}
