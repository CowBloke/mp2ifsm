"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changerMatierePaquet } from "@/lib/actions-fiches";

/** Reclassement d'un paquet (créateur ou administrateur). */
export function MatierePaquet({
  deckId, actuelle, matieres,
}: {
  deckId: number;
  actuelle: number | null;
  matieres: Array<{ id: number; nom: string; archivee: boolean }>;
}) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  // Une matière archivée reste affichée si c'est l'actuelle, sans
  // pouvoir être choisie à nouveau.
  const options = matieres.filter((m) => !m.archivee || m.id === actuelle);

  return (
    <label className="flex flex-col gap-1.5 text-[13px] text-[var(--muted-foreground)]">
      Matière
      <select
        defaultValue={actuelle ?? ""}
        disabled={enCours}
        onChange={(e) => {
          const valeur = e.target.value;
          setErreur(null);
          demarrer(async () => {
            const r = await changerMatierePaquet(deckId, valeur);
            if (r.ok) router.refresh(); else setErreur(r.erreur);
          });
        }}
        className="min-h-11 px-3 text-[14px] text-[var(--foreground)]"
      >
        <option value="">Sans matière</option>
        {options.map((m) => (
          <option key={m.id} value={m.id} disabled={m.archivee}>
            {m.nom}{m.archivee ? " (archivée)" : ""}
          </option>
        ))}
      </select>
      {erreur && <span role="alert" className="text-[var(--destructive)]">{erreur}</span>}
    </label>
  );
}
