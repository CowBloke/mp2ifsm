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
    <label className="app-surface flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border p-3">
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
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
      />
      <span>
        <span className="block text-[14px] font-medium">
          Partager mes révisions avec la classe
        </span>
        <span className="mt-0.5 block text-[12px] text-[var(--muted-foreground)]">
          Votre nom et votre nombre de révisions par jour apparaîtront dans la
          heatmap des paquets. Rien d’autre n’est partagé : ni vos notes, ni vos
          cartes difficiles.
        </span>
      </span>
    </label>
  );
}
