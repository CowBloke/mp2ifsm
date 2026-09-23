"use client";

import { useState } from "react";
import { EditeurCarte } from "./EditeurCarte";

/** Repli/dépli du formulaire d'ajout, pour ne pas encombrer la liste. */
export function PanneauAjoutCarte({ deckId }: { deckId: number }) {
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="w-full rounded-[var(--radius-md)] border border-dashed py-2.5 text-[13px]
                   font-medium text-[var(--muted-foreground)] transition-colors
                   hover:bg-[var(--muted)]"
      >
        + Ajouter une carte
      </button>
    );
  }

  return (
    <div className="app-surface rounded-[var(--radius-md)] border p-4">
      <EditeurCarte deckId={deckId} onFini={() => setOuvert(false)} />
    </div>
  );
}
