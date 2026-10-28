"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { creerDossier } from "@/lib/actions-dossiers";
import type { KindDossier } from "@/lib/constantes";

/*
 * Formulaire de création d'un dossier. Sans `parentId`, on crée un
 * dossier racine et, si `matieres` est fourni, on en choisit la matière ;
 * sous un parent, la matière est héritée.
 */
export function NouveauDossier({
  kind, parentId = null, matieres, onFini,
}: {
  kind: KindDossier;
  parentId?: number | null;
  matieres?: Array<{ id: number; nom: string }>;
  onFini: () => void;
}) {
  const router = useRouter();
  const [nom, setNom] = useState("");
  const [matiere, setMatiere] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  return (
    <form className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setErreur(null);
            demarrer(async () => {
              const r = await creerDossier(kind, parentId, nom, matiere);
              if (r.ok) { onFini(); router.refresh(); } else setErreur(r.erreur);
            });
          }}>
      <input value={nom} onChange={(e) => setNom(e.target.value)} required maxLength={60} autoFocus
             placeholder="Nom du dossier" aria-label="Nom du dossier" className="champ" />
      {parentId === null && matieres && (
        <select value={matiere} onChange={(e) => setMatiere(e.target.value)} aria-label="Matière"
                className="min-h-12 px-3">
          <option value="">Sans matière</option>
          {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
        </select>
      )}
      {erreur && <p role="alert" className="text-[13px] font-medium text-[var(--destructive)]">{erreur}</p>}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onFini} className="puce h-12">Annuler</button>
        <button type="submit" disabled={enCours || !nom.trim()} className="bouton-principal bouton-sombre h-12 flex-1 disabled:opacity-50">
          {enCours ? "…" : "Créer"}
        </button>
      </div>
    </form>
  );
}
