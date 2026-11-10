"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { COULEURS, type SalonOuvert } from "@/lib/courbes/vue";
import { Regles } from "./Salle";

const BASE = "/divertissement/curve-fight";
const PHASES: Record<SalonOuvert["phase"], string> = {
  salon: "En attente", preparation: "En partie", volee: "En partie", finManche: "En partie", fin: "Partie finie",
};

/** Décor du titre : quelques courbes qui glissent, comme sur un oscilloscope. */
function Oscilloscope() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const calme = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const courbes: ((x: number, t: number) => number)[] = [
      (x, t) => 0.55 * Math.sin(x * 1.3 + t),
      (x, t) => 0.35 * Math.sin(x * 2.4 - t * 1.4) + 0.25 * Math.cos(x * 0.7 + t * 0.5),
      (x, t) => 0.12 * (x - 3.2 + Math.sin(t * 0.4)) ** 2 - 0.6,
      (x, t) => 0.5 * Math.tanh(2 * Math.sin(x * 0.9 - t * 0.8)),
    ];
    let raf = 0;
    function image(ms: number) {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(r.width * dpr)) { canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, r.width, r.height);
      const t = calme ? 1 : ms / 1600;
      courbes.forEach((f, i) => {
        ctx.beginPath();
        for (let px = 0; px <= r.width; px += 4) {
          const y = r.height / 2 - f((px / r.width) * 6.4, t + i * 1.7) * r.height * 0.42;
          if (px) ctx.lineTo(px, y); else ctx.moveTo(px, y);
        }
        ctx.strokeStyle = COULEURS[[0, 1, 2, 4][i]];
        ctx.globalAlpha = 0.16; ctx.lineWidth = 8; ctx.stroke();
        ctx.globalAlpha = 0.75; ctx.lineWidth = 1.6; ctx.stroke();
      });
      ctx.globalAlpha = 1;
      if (!calme) raf = requestAnimationFrame(image);
    }
    raf = requestAnimationFrame(image);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} aria-hidden="true" className="absolute inset-0 h-full w-full opacity-70" />;
}

export function Accueil({ pseudo, salons: initiaux }: { pseudo: string; salons: SalonOuvert[] }) {
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
    <div className="flex flex-col gap-4">
      <section className="relative overflow-hidden rounded-[var(--radius-lg)] border border-white/10 bg-black/30 px-5 py-10 text-center sm:py-14">
        <Oscilloscope />
        <div className="relative">
          <h1 className="cf-logo text-[52px] sm:text-[88px]">CURVE FIGHT</h1>
          <p className="mx-auto mt-3 max-w-[520px] text-[15px] leading-relaxed text-white/75">
            Écris une fonction. Sans aperçu. Si sa courbe atteint un adversaire avant que la sienne ne t’atteigne, il disparaît.
          </p>
          <p className="mt-2 text-[12px] text-white/45">Connecté·e en tant que {pseudo} · 2 à 10 joueurs</p>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="cf-carte flex flex-col gap-3">
          <p className="cf-titre-carte mb-0">Nouvelle partie</p>
          <p className="text-[14px] text-white/65">Ouvre un salon, règle le mode et les fonctions autorisées, puis invite la classe. Seul ? Ajoute des bots.</p>
          <button type="button" className="cf-bouton mt-auto" onClick={creer} disabled={creation}>
            {creation ? "Création…" : "Créer un salon"}
          </button>
          {erreur && <p role="alert" className="text-[13px] text-[var(--cf-rose)]">{erreur}</p>}
        </section>

        <form className="cf-carte flex flex-col gap-3"
              onSubmit={(e) => { e.preventDefault(); if (codeValide) router.push(`${BASE}/salon/${code}`); }}>
          <p className="cf-titre-carte mb-0">Rejoindre par code</p>
          <input className="cf-champ text-center text-[24px] font-bold uppercase tracking-[0.4em]" value={code}
                 onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
                 placeholder="ABCD" aria-label="Code du salon" autoComplete="off" autoCapitalize="characters" spellCheck={false} />
          <button type="submit" className="cf-bouton-discret mt-auto min-h-[48px]" disabled={!codeValide}>Rejoindre</button>
        </form>
      </div>

      <section className="cf-carte">
        <p className="cf-titre-carte">Salons ouverts</p>
        {salons.length === 0 ? (
          <p className="text-[14px] text-white/50">Aucun salon pour l’instant. Ouvre le premier.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {salons.map((s) => (
              <li key={s.code}>
                <Link href={`${BASE}/salon/${s.code}`}
                      className="flex items-center gap-3 rounded-[var(--radius-sm)] bg-white/[0.04] px-3 py-3 text-white hover:bg-white/[0.09] hover:text-white">
                  <span className="font-mono text-[18px] font-black tracking-[0.2em] text-[var(--cf-cyan)]">{s.code}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">Salon de {s.hote}</span>
                    <span className="block text-[12px] text-white/50">
                      {s.mode === "brouillard" ? "Brouillard" : "Classique"} · {s.tir === "equadiff" ? "y′ = f(x, y)" : "y = f(x)"} · {s.joueurs} joueur{s.joueurs > 1 ? "s" : ""}
                    </span>
                  </span>
                  <span className={`text-[12px] font-semibold ${s.phase === "salon" ? "text-[#5dff9b]" : "text-white/50"}`}>
                    {s.phase === "salon" ? "Rejoindre" : `${PHASES[s.phase]} · regarder`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Regles />
        <Link href={`${BASE}/classement`} className="cf-carte block text-white hover:bg-white/[0.08] hover:text-white">
          <p className="cf-titre-carte">Classement</p>
          <p className="text-[18px] font-bold">Meilleurs joueurs, plus beaux tirs, fonctions fétiches →</p>
        </Link>
      </div>
    </div>
  );
}
