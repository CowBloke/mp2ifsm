"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { classerDocument, classerPaquet } from "@/lib/actions-dossiers";
import type { OptionDestination } from "@/lib/arbre-dossiers";

/** Range un document ou un paquet dans un dossier. */
export function ChoixDossier({
  cible, id, actuel, options, className = "",
}: {
  cible: "document" | "deck";
  id: number;
  actuel: number | null;
  options: OptionDestination[];
  className?: string;
}) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  return (
    <label className={`flex flex-col gap-1.5 text-[13px] text-[var(--muted-foreground)] ${className}`}>
      Dossier
      <select defaultValue={actuel === null ? "" : String(actuel)} disabled={enCours}
              className="min-h-11 px-3 text-[14px] text-[var(--foreground)]"
              onChange={(e) => {
                const dossier = e.target.value === "" ? null : Number(e.target.value);
                setErreur(null);
                demarrer(async () => {
                  const r = await (cible === "document" ? classerDocument : classerPaquet)(id, dossier);
                  if (r.ok) router.refresh(); else setErreur(r.erreur);
                });
              }}>
        {options.map((o) => (
          <option key={o.id ?? "aucun"} value={o.id ?? ""}>
            {" ".repeat(Math.max(0, o.niveau - 1))}{o.libelle}
          </option>
        ))}
      </select>
      {erreur && <span role="alert" className="text-[var(--destructive)]">{erreur}</span>}
    </label>
  );
}
