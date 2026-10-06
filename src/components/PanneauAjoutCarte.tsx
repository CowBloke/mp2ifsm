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
        className="lien-discret"
      >
        + Ajouter une carte
      </button>
    );
  }

  return (
    <div className="py-2">
      <EditeurCarte deckId={deckId} onFini={() => setOuvert(false)} />
    </div>
  );
}
