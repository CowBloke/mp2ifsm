"use client";

import { useState } from "react";
import type { GestionDossier } from "@/lib/arbre-dossiers";
import { Televersement } from "./Televersement";
import { NouveauDossier } from "./NouveauDossier";
import { PanneauDossier } from "./LigneDossier";
import { Dialogue } from "./Dialogue";

type Vue = "choix" | "fichier" | "dossier" | "gerer";

/*
 * En-tête de la page Documents : le titre (ou le dossier ouvert) et un
 * bouton « + » qui ouvre une fenêtre pour déposer un fichier ou créer
 * un dossier ici. Dans un dossier, « … » ouvre sa gestion.
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
  const [vue, setVue] = useState<Vue | null>(null);
  const fermer = () => setVue(null);
  const titres: Record<Vue, string> = {
    choix: "Ajouter", fichier: "Déposer un fichier", dossier: "Nouveau dossier", gerer: titre,
  };

  return (
    <>
      <header className="page-heading">
        <div className="min-w-0 flex-1">
          {children}
          <h1 className="[overflow-wrap:anywhere]">{titre}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {gestion?.peutModifier && (
            <button type="button" className="bouton-rond" aria-haspopup="dialog"
                    aria-label={`Gérer le dossier ${titre}`} onClick={() => setVue("gerer")}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
              </svg>
            </button>
          )}
          <button type="button" className="bouton-rond" aria-haspopup="dialog"
                  aria-label="Déposer un fichier ou créer un dossier"
                  onClick={() => setVue(peutCreerDossier ? "choix" : "fichier")}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8"
                 strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </div>
      </header>

      {vue && (
        <Dialogue key={vue} titre={titres[vue]} onFermer={fermer}>
          {vue === "choix" ? (
            <div className="flex flex-col">
              <button type="button" className="ligne ligne__titre w-full text-left" onClick={() => setVue("fichier")}>
                Déposer un fichier
              </button>
              <button type="button" className="ligne ligne__titre w-full text-left" onClick={() => setVue("dossier")}>
                Nouveau dossier
              </button>
            </div>
          ) : vue === "fichier" ? (
            quotaAtteint
              ? <p className="text-[15px] text-[var(--destructive)]">Espace plein : supprimez un document pour en déposer un autre.</p>
              : <Televersement matieres={matieres} dossier={dossier} onFermer={fermer} />
          ) : vue === "dossier" ? (
            <NouveauDossier kind="document" parentId={dossier?.id ?? null} matieres={matieres} onFini={fermer} />
          ) : gestion && (
            <PanneauDossier g={gestion} onFermer={fermer} />
          )}
        </Dialogue>
      )}
    </>
  );
}
