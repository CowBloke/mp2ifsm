"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { demanderRetrait, synchroniserMesDepots } from "@/lib/actions";
import { formatCentimes, formatMontantBrut, parseMontant } from "@/lib/money";

/*
 * Depot / retrait.
 *
 * Le depot n'est pas une saisie libre : l'argent ne peut entrer que par
 * l'API du site externe. Le bouton declenche un tirage et le solde
 * affiche ensuite est celui renvoye par le serveur.
 */
export function Portefeuille({ solde }: { solde: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "retrait">(null);
  const [montant, setMontant] = useState("");
  const [message, setMessage] = useState<{ ton: "ok" | "ko"; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();

  const centimes = parseMontant(montant);
  const tropCher = centimes !== null && centimes > solde;

  function synchroniser() {
    setMessage(null);
    demarrer(async () => {
      const r = await synchroniserMesDepots();
      setMessage(
        r.ok
          ? {
              ton: "ok",
              texte: r.data.credites > 0
                ? `${r.data.credites} dépôt(s) crédité(s)`
                : "Aucun nouveau dépôt",
            }
          : { ton: "ko", texte: r.erreur },
      );
      router.refresh();
    });
  }

  function retirer() {
    if (centimes === null || tropCher) return;
    setMessage(null);
    demarrer(async () => {
      const r = await demanderRetrait(montant);
      if (r.ok) {
        setMessage({ ton: "ok", texte: `Retrait de ${formatCentimes(centimes)} enregistré` });
        setMontant("");
        setMode(null);
      } else {
        setMessage({ ton: "ko", texte: r.erreur });
      }
      router.refresh();
    });
  }

  return (
    <div className="app-surface rounded-[var(--radius-lg)] border p-5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
        Solde disponible
      </p>
      {/* Valeur calculee par PostgreSQL (somme du grand livre). */}
      <p className="tabular mt-1 text-[32px] font-bold leading-none">{formatCentimes(solde)}</p>

      {mode === null ? (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={synchroniser}
            disabled={enCours}
            className="flex-1 rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-3
                       text-[14px] font-semibold text-[var(--primary-foreground)] disabled:opacity-50"
          >
            {enCours ? "…" : "Déposer"}
          </button>
          <button
            type="button"
            onClick={() => { setMode("retrait"); setMessage(null); }}
            disabled={solde <= 0}
            className="flex-1 rounded-[var(--radius-md)] border px-4 py-3 text-[14px]
                       font-medium transition-colors hover:bg-[var(--muted)] disabled:opacity-40"
          >
            Retirer
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <label htmlFor="retrait" className="text-[13px] font-medium">Montant à retirer</label>
          <div className="mt-1.5 flex items-center rounded-[var(--radius-md)] border-2
                          focus-within:border-[var(--ring)]">
            <input
              id="retrait"
              inputMode="decimal"
              autoFocus
              placeholder="0,00"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              className="tabular w-full bg-transparent px-3 py-2.5 text-xl font-semibold outline-none"
            />
            <button
              type="button"
              onClick={() => setMontant(formatMontantBrut(solde))}
              className="mr-1 rounded px-2 py-1 text-[12px] font-medium text-[var(--primary)]"
            >
              Tout
            </button>
            <span className="pr-3 text-xl font-semibold text-[var(--muted-foreground)]">€</span>
          </div>

          {tropCher && (
            <p role="alert" className="mt-2 text-[13px] font-medium text-[var(--destructive)]">
              Solde insuffisant
            </p>
          )}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => { setMode(null); setMontant(""); }}
              className="rounded-[var(--radius-md)] border px-4 py-2.5 text-[14px] font-medium"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={retirer}
              disabled={centimes === null || tropCher || enCours}
              className="flex-1 rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-2.5
                         text-[14px] font-semibold text-[var(--primary-foreground)] disabled:opacity-40"
            >
              {enCours ? "…" : "Confirmer le retrait"}
            </button>
          </div>
        </div>
      )}

      {message && (
        <p
          role="status"
          className={`mt-3 text-[13px] font-medium ${
            message.ton === "ok" ? "text-[var(--outcome-1)]" : "text-[var(--destructive)]"
          }`}
        >
          {message.texte}
        </p>
      )}

      <p className="mt-3 text-[11px] leading-snug text-[var(--muted-foreground)]">
        Les dépôts sont récupérés automatiquement depuis le site de la classe.
        Aucun solde ne peut être crédité à la main depuis cette page.
      </p>
    </div>
  );
}
