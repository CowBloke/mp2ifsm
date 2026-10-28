"use client";

import { useEffect, useRef } from "react";

/*
 * Fenêtre modale des formulaires de création : feuille en bas d'écran
 * sur mobile, boîte centrée au-delà. <dialog> natif : focus piégé,
 * Échap et fond inerte sans code supplémentaire. Un toucher sur le
 * fond ferme aussi.
 */
export function Dialogue({
  titre, onFermer, children,
}: { titre: string; onFermer: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  return (
    <dialog
      ref={ref} aria-label={titre}
      onCancel={(e) => { e.preventDefault(); onFermer(); }}
      onClick={(e) => { if (e.target === ref.current) onFermer(); }}
      className="dialogue"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold">{titre}</h2>
        <button type="button" onClick={onFermer} aria-label="Fermer"
                className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-[var(--muted)]">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8"
               strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <div className="mt-3">{children}</div>
    </dialog>
  );
}
