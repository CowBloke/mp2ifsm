"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { couleurIssue } from "./couleurs";
import { BarreCotes } from "./BarreCotes";
import { placerPari } from "@/lib/actions";
import {
  cotesImplicites, estimerGain, formatCentimes, formatMontantBrut,
  formatMultiplicateur, formatPourcentage, parseMontant, tempsRestant,
} from "@/lib/money";
import type { MarcheVue } from "@/lib/queries";

/*
 * Feuille de pari : une seule surface, un seul bouton de validation.
 *
 * L'apercu de gain affiche ici est une ESTIMATION cote client, calculee
 * a partir de la cagnotte visible. Elle ne sert qu'a informer avant le
 * clic. Le montant qui compte est celui que le serveur renvoie apres
 * avoir ecrit la mise dans le grand livre : c'est lui qui remplace
 * l'affichage optimiste (confirmation verifiee).
 */

const MISE_MINIMUM = 10; // centimes

type Etat =
  | { phase: "saisie" }
  | { phase: "envoi" }
  | { phase: "confirme"; mise: number; solde: number }
  | { phase: "erreur"; message: string };

export function FeuillePari({
  marche,
  solde,
  ouvert,
  issueInitiale,
  onFermer,
}: {
  marche: MarcheVue;
  solde: number;
  ouvert: boolean;
  issueInitiale: number | null;
  onFermer: () => void;
}) {
  const router = useRouter();
  const [issueId, setIssueId] = useState<number | null>(issueInitiale);
  const [montant, setMontant] = useState("");
  const [etat, setEtat] = useState<Etat>({ phase: "saisie" });
  const champRef = useRef<HTMLInputElement>(null);

  /* Une cle par tentative de pari. Conservee tant que la mise n'est pas
   * acceptee : reessayer apres une coupure reseau rejoue la MEME cle et
   * ne peut donc pas creer un second pari. */
  const [cle, setCle] = useState(() => crypto.randomUUID());

  const issues = marche.issues ?? [];

  useEffect(() => {
    if (ouvert) {
      setIssueId(issueInitiale);
      setEtat({ phase: "saisie" });
    }
  }, [ouvert, issueInitiale]);

  useEffect(() => {
    if (!ouvert) return;
    const surEchap = (e: KeyboardEvent) => e.key === "Escape" && onFermer();
    document.addEventListener("keydown", surEchap);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", surEchap);
      document.body.style.overflow = "";
    };
  }, [ouvert, onFermer]);

  const centimes = parseMontant(montant);
  const issue = issues.find((i) => i.id === issueId) ?? null;
  const rang = issue ? issues.indexOf(issue) : 0;

  const apercu = useMemo(() => {
    if (!issue || centimes === null) return null;
    const gain = estimerGain(centimes, marche.cagnotte, issue.mises);
    return {
      gain,
      benefice: gain - centimes,
      multiplicateur: formatMultiplicateur(centimes, gain),
      // Part de la cagnotte que la mise representerait, apres son ajout.
      partApres: (issue.mises + centimes) / (marche.cagnotte + centimes),
    };
  }, [issue, centimes, marche.cagnotte, marche.issues]);

  const partsActuelles = cotesImplicites(issues.map((i) => i.mises));

  const tropCher = centimes !== null && centimes > solde;
  const tropPetit = centimes !== null && centimes < MISE_MINIMUM;
  const peutValider =
    issue !== null && centimes !== null && !tropCher && !tropPetit && etat.phase !== "envoi";

  function fixerPart(fraction: number) {
    const brut = Math.floor(solde * fraction);
    setMontant(brut > 0 ? formatMontantBrut(brut) : "");
    champRef.current?.focus();
  }

  async function valider() {
    if (!peutValider || issueId === null) return;
    setEtat({ phase: "envoi" });

    const reponse = await placerPari(issueId, montant, cle);

    if (reponse.ok) {
      // Etat autoritatif renvoye par le serveur.
      setEtat({ phase: "confirme", mise: reponse.data.miseCentimes, solde: reponse.data.soldeCentimes });
      setCle(crypto.randomUUID());
      router.refresh();
    } else {
      setEtat({ phase: "erreur", message: reponse.erreur });
    }
  }

  if (!ouvert) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      style={{ background: "var(--sheet-backdrop)", animation: "fade-in 150ms ease-out" }}
      onClick={onFermer}
      role="dialog"
      aria-modal="true"
      aria-label="Placer une mise"
    >
      <div
        className="app-surface max-h-[calc(100dvh-1rem)] w-full max-w-[560px] overflow-y-auto rounded-t-2xl border-t bg-[var(--card)]
                   px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-[var(--radius-lg)] sm:border sm:p-6"
        style={{ animation: "sheet-in 220ms cubic-bezier(0.32,0.72,0,1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-[var(--border)]" aria-hidden />

        {etat.phase === "confirme" ? (
          <Confirmation
            mise={etat.mise}
            solde={etat.solde}
            issue={issue?.label ?? ""}
            couleur={couleurIssue(rang)}
            onFermer={() => {
              setMontant("");
              setEtat({ phase: "saisie" });
              onFermer();
            }}
          />
        ) : (
          <>
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              {tempsRestant(marche.closes_at)} · cagnotte {formatCentimes(marche.cagnotte)}
            </p>
            <h2 className="mt-1 text-[15px] font-semibold leading-snug">{marche.question}</h2>

            <div className="mt-3">
              <BarreCotes parts={partsActuelles} labels={issues.map((i) => i.label)} compacte />
            </div>

            {/* 1. Choisir une issue */}
            <div
              className={`mt-3 grid gap-2 ${issues.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}
              role="radiogroup"
              aria-label="Choisir une issue"
            >
              {issues.map((i, index) => {
                const choisie = i.id === issueId;
                return (
                  <button
                    key={i.id}
                    type="button"
                    role="radio"
                    aria-checked={choisie}
                    onClick={() => setIssueId(i.id)}
                    className={`flex items-center justify-between gap-2 rounded-[var(--radius-md)]
                                border-2 px-3 py-2.5 text-left transition-colors
                                ${choisie ? "bg-[var(--accent)]" : "border-[var(--border)] hover:bg-[var(--muted)]"}`}
                    style={choisie ? { borderColor: couleurIssue(index) } : undefined}
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{i.label}</span>
                    <span className="tabular text-[13px] font-semibold" style={{ color: couleurIssue(index) }}>
                      {formatPourcentage(partsActuelles[index])}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 2. Saisir un montant */}
            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <label htmlFor="montant" className="text-[13px] font-medium">Votre mise</label>
                <span className="tabular text-[12px] text-[var(--muted-foreground)]">
                  Solde {formatCentimes(solde)}
                </span>
              </div>

              <div className="mt-1.5 flex items-center rounded-[var(--radius-md)] border-2 bg-[var(--background)]
                              focus-within:border-[var(--ring)]">
                <input
                  ref={champRef}
                  id="montant"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0,00"
                  value={montant}
                  onChange={(e) => {
                    setMontant(e.target.value);
                    if (etat.phase === "erreur") setEtat({ phase: "saisie" });
                  }}
                  className="tabular w-full bg-transparent px-3 py-3 text-2xl font-semibold
                             outline-none placeholder:text-[var(--muted-foreground)]"
                />
                <span className="pr-3 text-2xl font-semibold text-[var(--muted-foreground)]">€</span>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2">
                {[
                  { label: "25 %", f: 0.25 },
                  { label: "50 %", f: 0.5 },
                  { label: "Max", f: 1 },
                ].map((b) => (
                  <button
                    key={b.label}
                    type="button"
                    onClick={() => fixerPart(b.f)}
                    disabled={solde < MISE_MINIMUM}
                    className="rounded-[var(--radius-md)] border py-2 text-[13px] font-medium
                               transition-colors hover:bg-[var(--muted)] disabled:opacity-40"
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Apercu du gain, mis a jour a chaque frappe */}
            <div
              className="mt-4 rounded-[var(--radius-md)] border bg-[var(--muted)]/50 p-3"
              aria-live="polite"
            >
              {apercu && issue ? (
                <>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[13px] text-[var(--muted-foreground)]">
                      Si « {issue.label} » gagne
                    </span>
                    <span className="tabular text-lg font-bold" style={{ color: couleurIssue(rang) }}>
                      {formatCentimes(apercu.gain)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between text-[12px] text-[var(--muted-foreground)]">
                    <span>
                      Bénéfice{" "}
                      <strong className="tabular text-[var(--foreground)]">
                        +{formatCentimes(apercu.benefice)}
                      </strong>{" "}
                      · {apercu.multiplicateur}
                    </span>
                    <span className="tabular">{formatPourcentage(apercu.partApres)} de la cagnotte</span>
                  </div>
                  <p className="mt-2 text-[11px] leading-snug text-[var(--muted-foreground)]">
                    Estimation au cours actuel. Les mises suivantes modifient la
                    cagnotte, donc le gain final peut différer.
                  </p>
                </>
              ) : (
                <p className="text-[13px] text-[var(--muted-foreground)]">
                  {issue ? "Entrez un montant pour voir votre gain potentiel."
                         : "Choisissez une issue pour commencer."}
                </p>
              )}
            </div>

            {/* Avertissement : la mise est definitive. */}
            <p className="mt-3 flex items-start gap-2 text-[12px] leading-snug text-[var(--muted-foreground)]">
              <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none"
                   stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
              </svg>
              <span>
                <strong className="text-[var(--foreground)]">Une mise est définitive.</strong>{" "}
                Impossible de la retirer ou de la revendre avant la résolution du marché.
              </span>
            </p>

            {(etat.phase === "erreur" || tropCher || tropPetit) && (
              <p
                role="alert"
                className="mt-3 rounded-[var(--radius-md)] bg-[var(--destructive)]/10 px-3 py-2
                           text-[13px] font-medium text-[var(--destructive)]"
              >
                {etat.phase === "erreur"
                  ? etat.message
                  : tropCher
                    ? "Solde insuffisant"
                    : "Mise minimum : 0,10 €"}
              </p>
            )}

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={onFermer}
                className="rounded-[var(--radius-md)] border px-4 py-3.5 text-[14px] font-medium
                           transition-colors hover:bg-[var(--muted)]"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={valider}
                disabled={!peutValider}
                className="flex-1 rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-3.5
                           text-[14px] font-semibold text-[var(--primary-foreground)]
                           transition-opacity disabled:opacity-40"
              >
                {etat.phase === "envoi" ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner /> Enregistrement…
                  </span>
                ) : centimes !== null ? (
                  `Miser ${formatCentimes(centimes)}`
                ) : (
                  "Miser"
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Confirmation({
  mise, solde, issue, couleur, onFermer,
}: {
  mise: number; solde: number; issue: string; couleur: string; onFermer: () => void;
}) {
  return (
    <div className="py-4 text-center" role="status">
      <div
        className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
        style={{ background: `color-mix(in oklab, ${couleur} 18%, transparent)` }}
      >
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke={couleur}
             strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <h2 className="mt-3 text-[17px] font-semibold">Mise enregistrée</h2>
      <p className="mt-1 text-[14px] text-[var(--muted-foreground)]">
        <strong className="tabular text-[var(--foreground)]">{formatCentimes(mise)}</strong> sur
        « {issue} »
      </p>
      {/* Solde renvoye par le serveur, pas une soustraction cote client. */}
      <p className="tabular mt-3 text-[13px] text-[var(--muted-foreground)]">
        Nouveau solde : <strong className="text-[var(--foreground)]">{formatCentimes(solde)}</strong>
      </p>
      <button
        type="button"
        onClick={onFermer}
        className="mt-5 w-full rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-3.5
                   text-[14px] font-semibold text-[var(--primary-foreground)]"
      >
        Terminé
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
