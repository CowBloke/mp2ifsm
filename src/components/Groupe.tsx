"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirGroupe, reporterGroupe } from "@/lib/actions-colles";

/*
 * Groupe de colles. Le colloscope est dans le code ; seul le numéro du
 * membre est en base. Sans groupe, aucun rappel de colle.
 *
 * GROUPE_MAX est passé en propriété par le serveur plutôt qu'importé :
 * les données du colloscope n'ont pas à partir dans le navigateur.
 */

function ChoixGroupe({
  valeur, onChange, max, id,
}: { valeur: string; onChange: (v: string) => void; max: number; id?: string }) {
  return (
    <select
      id={id}
      value={valeur}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-0 flex-1 rounded-[var(--radius-md)] border-2 px-2 py-2 text-[14px]
                 outline-none focus:border-[var(--ring)]"
    >
      <option value="">Choisir…</option>
      {Array.from({ length: max }, (_, i) => i + 1).map((g) => (
        <option key={g} value={g}>Groupe {g}</option>
      ))}
    </select>
  );
}

/** Réglage du groupe : enregistré dès la sélection, « Aucun » le retire. */
export function ReglageGroupe({ groupe, max = 16 }: { groupe: number | null; max?: number }) {
  const router = useRouter();
  const [valeur, setValeur] = useState(groupe ? String(groupe) : "");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function enregistrer(v: string) {
    const avant = valeur;
    setValeur(v);
    setErreur(null);
    demarrer(async () => {
      const r = await definirGroupe(v === "" ? null : Number(v));
      if (!r.ok) { setValeur(avant); setErreur(r.erreur); return; }
      router.refresh();
    });
  }

  return (
    <div className="ligne">
      <label htmlFor="groupe-colle" className="ligne__titre flex-1">Groupe de colles</label>
      <select id="groupe-colle" value={valeur} disabled={enCours}
              onChange={(e) => enregistrer(e.target.value)} className="h-11 px-3 text-[14px]">
        <option value="">Aucun</option>
        {Array.from({ length: max }, (_, i) => i + 1).map((g) => (
          <option key={g} value={g}>Groupe {g}</option>
        ))}
      </select>
      {erreur && <p role="alert" className="text-[12px] text-[var(--destructive)]">{erreur}</p>}
    </div>
  );
}

/**
 * Demande de groupe, affichée à chaque connexion tant qu'il manque.
 * « Plus tard » (ou Échap) la masque pour la session en cours.
 */
export function DemandeGroupe({ max = 16 }: { max?: number }) {
  const router = useRouter();
  const [visible, setVisible] = useState(true);
  const [valeur, setValeur] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const dialogue = useRef<HTMLDivElement>(null);

  function fermer() {
    setVisible(false);
    // Mémorisé côté serveur pour la session : un rechargement ne la
    // fait pas revenir, une nouvelle connexion si.
    demarrer(async () => { await reporterGroupe(); });
  }

  useEffect(() => {
    if (!visible) return;
    dialogue.current?.querySelector("select")?.focus();
    const touche = (e: KeyboardEvent) => { if (e.key === "Escape") fermer(); };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center"
         style={{ background: "var(--sheet-backdrop)", animation: "fade-in .15s ease-out" }}
         onClick={(e) => { if (e.target === e.currentTarget) fermer(); }}>
      <div ref={dialogue} role="dialog" aria-modal="true" aria-labelledby="demande-groupe-titre"
           className="app-surface max-h-[calc(100dvh-2rem)] w-full max-w-[420px] overflow-y-auto rounded-[var(--radius-lg)] border bg-[var(--card)] p-5 shadow-xl">
        <h2 id="demande-groupe-titre" className="text-[16px] font-bold">Quel est votre groupe de colles ?</h2>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setErreur(null);
            demarrer(async () => {
              const r = await definirGroupe(Number(valeur));
              if (!r.ok) { setErreur(r.erreur); return; }
              setVisible(false);
              router.refresh();
            });
          }}
        >
          <ChoixGroupe valeur={valeur} onChange={setValeur} max={max} />
          <button type="submit" disabled={enCours || !valeur}
                  className="rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-2 text-[14px]
                             font-semibold text-[var(--primary-foreground)] disabled:opacity-40">
            Valider
          </button>
        </form>
        {erreur && <p role="alert" className="mt-2 text-[12px] text-[var(--destructive)]">{erreur}</p>}
        <button type="button" onClick={fermer}
                className="mt-3 w-full rounded-[var(--radius-md)] py-2 text-[13px] font-medium
                           text-[var(--muted-foreground)] hover:bg-[var(--muted)]">
          Plus tard
        </button>
      </div>
    </div>
  );
}
