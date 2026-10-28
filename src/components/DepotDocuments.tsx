"use client";

import { useState } from "react";
import type { GestionDossier } from "@/lib/arbre-dossiers";
import { Televersement } from "./Televersement";
import { NouveauDossier } from "./NouveauDossier";
import { PanneauDossier } from "./LigneDossier";

/*
 * En-tête de la page Documents : le titre (ou le dossier ouvert) et un
 * bouton « + » pour déposer un fichier ou créer un dossier ici. Dans un
 * dossier, « … » ouvre sa gestion.
 */
export function DepotDocuments({
  titre, quotaAtteint, matieres, dossier, peutCreerDossier, gestion, children,
}: {
  titre: string;
  quotaAtteint: boolean;
  matieres: Array<{ id: number; nom: string }>;
  dossier: { id: number; matiere: number | null } | null;
  peutCreerDossier: boolean;
  gestion?: GestionDossier;
  /** Fil d'Ariane, au-dessus du titre. */
  children?: React.ReactNode;
}) {
  const [vue, setVue] = useState<null | "choix" | "fichier" | "dossier" | "gerer">(null);
  const fermer = () => setVue(null);

  return (
    <>
      <header className="page-heading">
        <div className="min-w-0 flex-1">
          {children}
          <h1 className="[overflow-wrap:anywhere]">{titre}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {gestion?.peutModifier && (
            <button type="button" className="bouton-rond" aria-expanded={vue === "gerer"}
                    aria-label={`Gérer le dossier ${titre}`}
                    onClick={() => setVue(vue === "gerer" ? null : "gerer")}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
              </svg>
            </button>
          )}
          <button type="button" className="bouton-rond" aria-expanded={vue !== null && vue !== "gerer"}
                  aria-label={vue && vue !== "gerer" ? "Fermer" : "Déposer un fichier ou créer un dossier"}
                  onClick={() => setVue(vue && vue !== "gerer" ? null : peutCreerDossier ? "choix" : "fichier")}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8"
                 strokeLinecap="round" aria-hidden="true">
              <path d={vue && vue !== "gerer" ? "M6 6l12 12M18 6 6 18" : "M12 5v14M5 12h14"} />
            </svg>
          </button>
        </div>
      </header>

      {vue === "choix" && (
        <div className="-mt-4 mb-10 flex flex-wrap gap-2">
          <button type="button" className="puce" onClick={() => setVue("fichier")}>Déposer un fichier</button>
          <button type="button" className="puce" onClick={() => setVue("dossier")}>Nouveau dossier</button>
        </div>
      )}
      {vue === "fichier" && (
        <div className="-mt-4 mb-10">
          {quotaAtteint
            ? <p className="text-[15px] text-[var(--destructive)]">Espace plein : supprimez un document pour en déposer un autre.</p>
            : <Televersement matieres={matieres} dossier={dossier} onFermer={fermer} />}
        </div>
      )}
      {vue === "dossier" && (
        <div className="-mt-4 mb-10">
          <NouveauDossier kind="document" parentId={dossier?.id ?? null} matieres={matieres} onFini={fermer} />
        </div>
      )}
      {vue === "gerer" && gestion && (
        <div className="-mt-4 mb-10">
          <PanneauDossier g={gestion} decale={false} onFermer={fermer} />
        </div>
      )}
    </>
  );
}
