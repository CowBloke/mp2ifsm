"use client";

import { useState } from "react";
import { EditeurCarte } from "./EditeurCarte";
import { Dialogue } from "./Dialogue";

/** Ajout d'une carte dans une fenêtre, pour ne pas décaler la liste. */
export function PanneauAjoutCarte({ deckId }: { deckId: number }) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOuvert(true)} aria-haspopup="dialog" className="lien-discret">
        + Ajouter une carte
      </button>
      {ouvert && (
        <Dialogue titre="Nouvelle carte" onFermer={() => setOuvert(false)}>
          <EditeurCarte deckId={deckId} onFini={() => setOuvert(false)} />
        </Dialogue>
      )}
    </>
  );
}
