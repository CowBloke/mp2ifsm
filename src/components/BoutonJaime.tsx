"use client";

import { useState, useTransition } from "react";
import { aimerPaquet } from "@/lib/actions-fiches";

/** Cœur + compteur, mis à jour tout de suite puis confirmé par le serveur. */
export function BoutonJaime({
  deckId, likes, aime, compact = false,
}: { deckId: number; likes: number; aime: boolean; compact?: boolean }) {
  const [etat, setEtat] = useState({ likes, aime });
  const [enCours, demarrer] = useTransition();

  function basculer() {
    const avant = etat;
    const suivant = { aime: !etat.aime, likes: etat.likes + (etat.aime ? -1 : 1) };
    setEtat(suivant);
    demarrer(async () => {
      const r = await aimerPaquet(deckId, suivant.aime);
      setEtat(r.ok ? r.data : avant);
    });
  }

  return (
    <button
      type="button" onClick={basculer} disabled={enCours} aria-pressed={etat.aime}
      aria-label={`${etat.aime ? "Je n’aime plus" : "J’aime"} — ${etat.likes} j’aime`}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 text-[13px] tabular
                  ${compact ? "h-9" : "h-11"}
                  ${etat.aime ? "text-[var(--destructive)]" : "text-[var(--muted-foreground)]"}
                  hover:bg-[var(--muted)]`}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
           fill={etat.aime ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8"
           strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z" />
      </svg>
      {etat.likes > 0 && <span>{etat.likes}</span>}
    </button>
  );
}
