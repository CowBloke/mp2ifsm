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
        
        title={etat ? "Ne plus suivre : votre progression est conservée" : "Ajouter à mes révisions"}
        className={`puce shrink-0 disabled:opacity-60 ${compact ? "h-9" : "h-11"} ${
          etat ? "text-[var(--muted-foreground)]" : ""
        }`}
      >
        {etat ? "Suivi" : "Suivre"}
      </button>
      {erreur && <span role="alert" className="mt-1 text-[11px] text-[var(--destructive)]">{erreur}</span>}
    </span>
  );
}
