"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { supprimerVideo } from "@/lib/actions-videos";
import type { VideoEnCours } from "@/lib/videos";

/* Vidéos du membre en cours de montage : la page se rafraîchit seule. */
export function SuiviMontage({ videos }: { videos: VideoEnCours[] }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const attente = videos.some((v) => v.statut === "traitement");

  useEffect(() => {
    if (!attente) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [attente, router]);

  return (
    <section aria-label="Mes vidéos en préparation" className="mb-5 space-y-2">
      {videos.map((v) => (
        <div key={v.id} className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--card)] p-3">
          {v.statut === "traitement"
            ? <span className="videos__roue" aria-hidden="true" />
            : <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--destructive)] text-[13px] font-bold text-white" aria-hidden="true">!</span>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold">{v.titre}</p>
            <p className="text-[13px] text-[var(--muted-foreground)]">
              {v.statut === "traitement" ? "Montage en cours sur le serveur…" : "Le montage a échoué. Supprimez-la et réessayez."}
            </p>
          </div>
          <button type="button" disabled={enCours} className="lien-discret text-[13px]"
                  onClick={() => demarrer(async () => {
                    const r = await supprimerVideo(v.id);
                    if (!r.ok) setErreur(r.erreur); else router.refresh();
                  })}>{v.statut === "traitement" ? "Annuler" : "Supprimer"}</button>
        </div>
      ))}
      {erreur && <p role="alert" className="text-[13px] text-[var(--destructive)]">{erreur}</p>}
    </section>
  );
}
