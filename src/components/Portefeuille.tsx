"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { transfererKc } from "@/lib/actions";
import { CENTIEMES_PAR_KC, formatCentimes, kcRetirables, parseKc } from "@/lib/money";

/*
 * Depot / retrait avec kcmaths.com. Le solde est en pricoupenkoins
 * (decimaux) ; les transferts se font en KC coins entiers, 1 KC = 1 PCK.
 *
 * Le solde affiche apres un transfert est celui renvoye par le serveur.
 * Une cle d'idempotence est tiree a l'ouverture du formulaire : un
 * double tap ou un renvoi reseau ne transfere jamais deux fois.
 */

type Mode = "depot" | "retrait";

export function Portefeuille({
  solde,
  enAttente,
}: {
  solde: number;
  enAttente: { sens: Mode; montant: number }[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<null | Mode>(null);
  const [cle, setCle] = useState("");
  const [montant, setMontant] = useState("");
  const [message, setMessage] = useState<{ ton: "ok" | "ko"; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();

  const kc = parseKc(montant);
  const retirables = kcRetirables(solde);
  const tropCher = mode === "retrait" && kc !== null && kc > retirables;
  const kcTexte = (n: number) => `${n.toLocaleString("fr-FR")} KC`;

  function ouvrir(m: Mode) {
    setMode(m);
    setCle(crypto.randomUUID());
    setMontant("");
    setMessage(null);
  }

  function valider() {
    if (mode === null || kc === null || tropCher) return;
    setMessage(null);
    demarrer(async () => {
      const r = await transfererKc(mode, montant, cle);
      if (!r.ok) {
        setMessage({ ton: "ko", texte: r.erreur });
      } else if (r.data.statut === "refuse") {
        setMessage({ ton: "ko", texte: r.data.motif ?? "Transfert refusé" });
        setMode(null);
      } else {
        const quoi = mode === "depot" ? "Dépôt" : "Retrait";
        setMessage(
          r.data.statut === "effectue"
            ? { ton: "ok", texte: `${quoi} de ${kcTexte(kc)} effectué` }
            : { ton: "ok", texte: `${quoi} de ${kcTexte(kc)} en attente de kcmaths` },
        );
        setMode(null);
        setMontant("");
      }
      router.refresh();
    });
  }

  return (
    <div>
      <p className="text-[13px] text-[var(--muted-foreground)]">
        Pricoupenkoins disponibles
      </p>
      {/* Valeur calculee par PostgreSQL (somme du grand livre). */}
      <p className="mt-1 text-[44px] font-semibold leading-none tracking-[-0.03em]">{formatCentimes(solde)}</p>

      {mode === null ? (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => ouvrir("depot")}
            className="flex-1 rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-3
                       text-[14px] font-semibold text-[var(--primary-foreground)]"
          >
            Déposer
          </button>
          <button
            type="button"
            onClick={() => ouvrir("retrait")}
            disabled={retirables <= 0}
            className="flex-1 rounded-[var(--radius-md)] border px-4 py-3 text-[14px]
                       font-medium transition-colors hover:bg-[var(--muted)] disabled:opacity-40"
          >
            Retirer
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <label htmlFor="montant-kc" className="text-[13px] font-medium">
            {mode === "depot"
              ? "KC coins à convertir en pricoupenkoins"
              : `KC coins à renvoyer sur kcmaths (${kcTexte(retirables)} max)`}
          </label>
          <div className="mt-1.5 flex items-center rounded-[var(--radius-md)] border-2
                          focus-within:border-[var(--ring)]">
            <input
              id="montant-kc"
              inputMode="numeric"
              autoFocus
              placeholder="0"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              className="tabular w-full bg-transparent px-3 py-2.5 text-xl font-semibold outline-none"
            />
            {mode === "retrait" && (
              <button
                type="button"
                onClick={() => setMontant(String(retirables))}
                className="mr-1 rounded px-2 py-1 text-[12px] font-medium text-[var(--primary)]"
              >
                Tout
              </button>
            )}
            <span className="pr-3 text-xl font-semibold text-[var(--muted-foreground)]">KC</span>
          </div>

          {kc !== null && (
            <p className="mt-2 text-[12px] text-[var(--muted-foreground)]">
              {mode === "depot" ? "+" : "−"}{formatCentimes(kc * CENTIEMES_PAR_KC)} sur mp2ifsm
            </p>
          )}
          {montant.trim() !== "" && kc === null && (
            <p role="alert" className="mt-2 text-[13px] font-medium text-[var(--destructive)]">
              Nombre entier de KC coins uniquement
            </p>
          )}
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
              onClick={valider}
              disabled={kc === null || tropCher || enCours}
              className="flex-1 rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-2.5
                         text-[14px] font-semibold text-[var(--primary-foreground)] disabled:opacity-40"
            >
              {enCours ? "…" : mode === "depot" ? "Confirmer le dépôt" : "Confirmer le retrait"}
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

      {enAttente.length > 0 && (
        <ul className="mt-3 space-y-1 text-[12px] text-[var(--muted-foreground)]">
          {enAttente.map((t, i) => (
            <li key={i}>
              {t.sens === "depot" ? "Dépôt" : "Retrait"} de {kcTexte(t.montant)} en
              attente — nouvel essai automatique toutes les 10 minutes.
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-[11px] leading-snug text-[var(--muted-foreground)]">
        1 KC coin = 1 pricoupenkoin. Seuls des KC coins entiers peuvent être
        renvoyés sur kcmaths.com ; votre compte y est identifié par votre email.
      </p>
    </div>
  );
}
