"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { suivrePaquet } from "@/lib/actions-fiches";

/*
 * Suivre / ne plus suivre un paquet. Se désabonner ne perd rien :
 * l'historique et la planification sont conservés et reprennent au
 * réabonnement.
 */
export function BoutonSuivre({
  deckId, abonne, compact = false,
}: { deckId: number; abonne: boolean; compact?: boolean }) {
  const router = useRouter();
  const [etat, setEtat] = useState(abonne);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function basculer() {
    const suivant = !etat;
    setErreur(null);
    setEtat(suivant);
    demarrer(async () => {
      const r = await suivrePaquet(deckId, suivant);
      if (!r.ok) { setEtat(!suivant); setErreur(r.erreur); return; }
      router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={basculer}
        disabled={enCours}
        aria-pressed={etat}
        title={etat ? "Ne plus suivre : votre progression est conservée" : "Ajouter à mes révisions"}
        className={`shrink-0 rounded-full font-semibold transition-colors disabled:opacity-60 ${
          compact ? "px-2.5 py-1 text-[11px]" : "px-3.5 py-2 text-[13px]"
        } ${
          etat
            ? "border text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
            : "bg-[var(--primary)] text-[var(--primary-foreground)]"
        }`}
      >
        {etat ? "Suivi ✓" : "+ Suivre"}
      </button>
      {erreur && <span role="alert" className="mt-1 text-[11px] text-[var(--destructive)]">{erreur}</span>}
    </span>
  );
}
