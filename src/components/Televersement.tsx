"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChoixMatiere } from "@/components/Matiere";

/*
 * Dépôt d'un document.
 *
 * Passe par une route (et non une action serveur) parce qu'un fichier
 * peut peser plusieurs dizaines de Mo. La règle sur les droits d'auteur
 * reste visible au-dessus du bouton, et chaque fichier garde l'identité
 * de son déposant — c'est ce qui rend la règle applicable.
 */
export function Televersement({
  matieres, dossier = null, onFermer,
}: {
  matieres: Array<{ id: number; nom: string }>;
  /** Dossier courant : le document y est rangé, avec sa matière. */
  dossier?: { id: number; matiere: number | null } | null;
  onFermer: () => void;
}) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function envoyer(fd: FormData) {
    setErreur(null);
    setEnCours(true);
    try {
      const res = await fetch("/api/documents/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setErreur(data.erreur ?? "Envoi impossible"); return; }
      onFermer();
      router.refresh();
    } catch {
      setErreur("Envoi impossible — réessayez");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form action={envoyer} className="flex flex-col gap-2">
      <input
        type="file" name="fichier" required aria-label="Fichier"
        className="w-full text-[14px] file:mr-3 file:rounded-[var(--radius-sm)]
                   file:border-0 file:bg-[var(--secondary)] file:px-3 file:py-2
                   file:text-[14px] file:font-medium"
      />
      {dossier && <input type="hidden" name="dossier" value={dossier.id} />}
      {!(dossier && dossier.matiere !== null) && <ChoixMatiere matieres={matieres} />}

      <p className="text-[13px] text-[var(--muted-foreground)]">Pas de contenu sous droits d’auteur.</p>
      {erreur && <p role="alert" className="text-[13px] font-medium text-[var(--destructive)]">{erreur}</p>}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onFermer} className="puce h-12">Annuler</button>
        <button type="submit" disabled={enCours} className="bouton-principal h-12 flex-1">
          {enCours ? "Envoi…" : "Déposer"}
        </button>
      </div>
    </form>
  );
}
