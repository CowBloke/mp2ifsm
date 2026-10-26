"use client";

import { useState } from "react";
import type { GestionDossier } from "@/lib/arbre-dossiers";
import type { KindDossier } from "@/lib/constantes";
import { NouveauDossier } from "./NouveauDossier";
import { PanneauDossier } from "./LigneDossier";

/**
 * Outils du dossier affiché : en créer un nouveau dedans et, quand
 * l'utilisateur en a le droit, gérer le dossier lui-même.
 */
export function BarreDossier({
  kind, parentId, matieres, gestion, peutCreer = true,
}: {
  kind: KindDossier;
  parentId: number | null;
  matieres: Array<{ id: number; nom: string }>;
  gestion?: GestionDossier;
  peutCreer?: boolean;
}) {
  const [vue, setVue] = useState<null | "creer" | "gerer">(null);
  const peutGerer = gestion?.peutModifier;
  if (!peutCreer && !peutGerer) return null;

  return (
    <div className="mb-4">
      <div className="flex flex-wrap gap-2">
        {peutCreer && (
          <button type="button" className="puce" aria-pressed={vue === "creer"}
                  onClick={() => setVue(vue === "creer" ? null : "creer")}>
            Nouveau dossier
          </button>
        )}
        {peutGerer && (
          <button type="button" className="puce" aria-pressed={vue === "gerer"}
                  onClick={() => setVue(vue === "gerer" ? null : "gerer")}>
            Gérer ce dossier
          </button>
        )}
      </div>
      {vue === "creer" && (
        <div className="mt-4">
          <NouveauDossier kind={kind} parentId={parentId} matieres={matieres} onFini={() => setVue(null)} />
        </div>
      )}
      {vue === "gerer" && gestion && (
        <div className="mt-4">
          <PanneauDossier g={gestion} decale={false} onFermer={() => setVue(null)} />
        </div>
      )}
    </div>
  );
}
