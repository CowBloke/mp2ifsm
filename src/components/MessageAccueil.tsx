"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { modifierMessageAccueil } from "@/lib/actions-accueil";

/*
 * Message d'accueil de la classe. Les membres le lisent ; un admin le
 * modifie sur place (crayon), et un message vide le retire.
 */
export function MessageAccueil({ texte, estAdmin }: { texte: string; estAdmin: boolean }) {
  const router = useRouter();
  const [edition, setEdition] = useState(false);
  const [brouillon, setBrouillon] = useState(texte);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  if (!texte && !estAdmin) return null;

  function enregistrer(valeur: string) {
    setErreur(null);
    demarrer(async () => {
      const r = await modifierMessageAccueil(valeur);
      if (r.ok) { setEdition(false); router.refresh(); } else setErreur(r.erreur);
    });
  }

  if (edition) {
    return (
      <section aria-label="Modifier le message d’accueil"
               className="rounded-[var(--radius-lg)] border p-4">
        <textarea value={brouillon} onChange={(e) => setBrouillon(e.target.value)} autoFocus
                  maxLength={1000} rows={3} placeholder="Message pour toute la classe…"
                  className="w-full resize-y bg-transparent text-[15px] leading-relaxed outline-none" />
        {erreur && <p role="alert" className="text-[13px] font-medium text-[var(--destructive)]">{erreur}</p>}
        <div className="mt-2 flex items-center gap-2">
          <span className="tabular mr-auto text-[12px] text-[var(--muted-foreground)]">{brouillon.length}/1000</span>
          {texte && (
            <button type="button" disabled={enCours} onClick={() => enregistrer("")}
                    className="px-2 py-2 text-[14px] text-[var(--destructive)]">Retirer</button>
          )}
          <button type="button" onClick={() => { setBrouillon(texte); setEdition(false); setErreur(null); }}
                  className="rounded-[var(--radius-md)] border px-3 py-2 text-[14px] font-medium">Annuler</button>
          <button type="button" disabled={enCours} onClick={() => enregistrer(brouillon)}
                  className="rounded-[var(--radius-md)] bg-[var(--primary)] px-3 py-2 text-[14px]
                             font-semibold text-[var(--primary-foreground)] disabled:opacity-50">
            {enCours ? "…" : "Publier"}
          </button>
        </div>
      </section>
    );
  }

  if (!texte) {
    return (
      <button type="button" onClick={() => setEdition(true)} className="lien-discret -my-6 self-start">
        + Message pour la classe
      </button>
    );
  }

  return (
    <section aria-label="Message de la classe"
             className="flex items-start gap-3 rounded-[var(--radius-lg)] bg-[var(--secondary)] p-4
                        text-[var(--secondary-foreground)]">
      <p className="min-w-0 flex-1 whitespace-pre-line text-[15px] leading-relaxed [overflow-wrap:anywhere]">
        {texte}
      </p>
      {estAdmin && (
        <button type="button" onClick={() => { setBrouillon(texte); setEdition(true); }}
                aria-label="Modifier le message"
                className="-m-2 grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-[var(--muted)]">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />
          </svg>
        </button>
      )}
    </section>
  );
}
