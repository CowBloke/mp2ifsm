"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { supprimerPaquet } from "@/lib/actions-fiches";

/** Suppression d'un paquet (créateur ou administrateur). */
export function SupprimerPaquet({ deckId, titre }: { deckId: number; titre: string }) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]">
      <button
        type="button"
        disabled={enCours}
        onClick={() => {
          if (!window.confirm(`Supprimer le paquet « ${titre} » et toutes ses cartes ?\n`
            + "Il disparaîtra pour toute la classe. Les autres paquets ne sont pas touchés.")) return;
          setErreur(null);
          demarrer(async () => {
            const r = await supprimerPaquet(deckId);
            if (r.ok) { router.replace("/fiches"); router.refresh(); } else setErreur(r.erreur);
          });
        }}
        className="font-medium text-[var(--destructive)] hover:underline disabled:opacity-50"
      >
        {enCours ? "Suppression…" : "Supprimer le paquet"}
      </button>
      {erreur && <span role="alert" className="text-[var(--destructive)]">{erreur}</span>}
    </span>
  );
}
