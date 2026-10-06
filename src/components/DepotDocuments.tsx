"use client";

import { useState } from "react";
import { Televersement } from "./Televersement";

/*
 * En-tête de la page Documents : le titre et un bouton rond de dépôt.
 * Le formulaire et l'espace occupé n'apparaissent qu'à l'ouverture.
 */
export function DepotDocuments({
  restant, matieres, children,
}: {
  restant: number;
  matieres: Array<{ id: number; nom: string }>;
  children: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <>
      <header className="page-heading">
        <h1>Documents</h1>
        <button type="button" className="bouton-rond" aria-expanded={ouvert}
                aria-label={ouvert ? "Fermer le dépôt" : "Déposer un document"}
                onClick={() => setOuvert(!ouvert)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={ouvert ? "M6 6l12 12M18 6 6 18" : "M12 16V4M7 9l5-5 5 5M5 20h14"} />
          </svg>
        </button>
      </header>
      {ouvert && (
        <div className="-mt-4 mb-10 flex flex-col gap-5">
          {restant > 0
            ? <Televersement restant={restant} matieres={matieres} onFermer={() => setOuvert(false)} />
            : <p className="text-[15px] text-[var(--destructive)]">Quota atteint : supprimez un document pour en déposer un autre.</p>}
          {children}
        </div>
      )}
    </>
  );
}
