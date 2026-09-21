"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ajouterEcheance } from "@/lib/actions-echeances";
import { ChoixMatiere } from "@/components/Matiere";

const TYPES = ["DS", "DM", "Colle", "TIPE", "Oral", "Projet", "Autre"] as const;

/** Ajout d'une échéance par n'importe qui dans la classe. */
export function FormulaireEcheance({
  matieres,
}: { matieres: Array<{ id: number; nom: string }> }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="mt-3 w-full rounded-[var(--radius-md)] border border-dashed py-2
                   text-[13px] font-medium text-[var(--muted-foreground)]
                   transition-colors hover:bg-[var(--muted)]"
      >
        + Ajouter une échéance
      </button>
    );
  }

  return (
    <form
      action={(fd) => {
        setErreur(null);
        demarrer(async () => {
          const local = String(fd.get("dueAt") ?? "");
          if (local) fd.set("dueAt", new Date(local).toISOString());
          const r = await ajouterEcheance(fd);
          if (r.ok) { setOuvert(false); router.refresh(); }
          else setErreur(r.erreur);
        });
      }}
      className="mt-3 space-y-2 border-t pt-3"
    >
      <input
        name="titre" required minLength={3} maxLength={120}
        placeholder="DS de maths — chapitres 1 à 4"
        className="w-full rounded-[var(--radius-md)] border-2 px-3 py-2 text-[14px]
                   outline-none focus:border-[var(--ring)]"
      />
      <div className="grid grid-cols-2 gap-2">
        <select name="kind" defaultValue="DS"
                className="rounded-[var(--radius-md)] border-2 px-2 py-2 text-[14px]
                           outline-none focus:border-[var(--ring)]">
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <ChoixMatiere matieres={matieres} />
      </div>
      <input
        name="dueAt" type="datetime-local" required
        className="w-full rounded-[var(--radius-md)] border-2 px-3 py-2 text-[14px]
                   outline-none focus:border-[var(--ring)]"
      />

      {erreur && (
        <p role="alert" className="text-[13px] font-medium text-[var(--destructive)]">{erreur}</p>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={() => setOuvert(false)}
                className="rounded-[var(--radius-md)] border px-3 py-2 text-[13px] font-medium">
          Annuler
        </button>
        <button type="submit" disabled={enCours}
                className="flex-1 rounded-[var(--radius-md)] bg-[var(--primary)] px-3 py-2
                           text-[13px] font-semibold text-[var(--primary-foreground)]
                           disabled:opacity-50">
          {enCours ? "…" : "Ajouter"}
        </button>
      </div>
    </form>
  );
}
