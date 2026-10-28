"use client";

import { useState, useTransition } from "react";
import { basculerPartageStats } from "@/lib/actions-fiches";

/*
 * Partage des statistiques de révision.
 *
 * Désactivé par défaut. Tant que la case est décochée, le membre
 * n'apparaît dans aucune heatmap — le filtre est appliqué en SQL, pas
 * seulement à l'affichage.
 */
export function ReglagePartageStats({ initial }: { initial: boolean }) {
  const [actif, setActif] = useState(initial);
  const [enCours, demarrer] = useTransition();

  return (
    <label className="ligne cursor-pointer">
      <span className="ligne__titre flex-1">Partager mes révisions avec la classe</span>
      <input
        type="checkbox"
        checked={actif}
        disabled={enCours}
        onChange={(e) => {
          const valeur = e.target.checked;
          setActif(valeur);
          demarrer(async () => {
            const r = await basculerPartageStats(valeur);
            if (!r.ok) { setActif(!valeur); window.alert(r.erreur); }
          });
        }}
        className="h-5 w-5 shrink-0 accent-[var(--primary)]"
      />
    </label>
  );
}
