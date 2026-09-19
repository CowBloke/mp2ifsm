"use client";

import { useState } from "react";
import { couleurIssue } from "./couleurs";
import { FeuillePari } from "./FeuillePari";
import { cotesImplicites, formatCentimes, formatPourcentage } from "@/lib/money";
import type { MarcheVue } from "@/lib/queries";

/*
 * Liste des issues sur la page d'un marche. Chaque issue est un bouton
 * qui ouvre la feuille de pari deja positionnee sur ce choix : un seul
 * geste entre « je veux ca » et l'ecran de saisie.
 */
export function PanneauPari({ marche, solde }: { marche: MarcheVue; solde: number }) {
  const [issueOuverte, setIssueOuverte] = useState<number | null>(null);
  const [ouvert, setOuvert] = useState(false);

  const issues = marche.issues ?? [];
  const parts = cotesImplicites(issues.map((i) => i.mises));
  const ferme = marche.status !== "open";

  return (
    <>
      <ul className="space-y-2">
        {issues.map((issue, i) => {
          const gagnante = issue.id === marche.resolved_outcome_id;
          return (
            <li key={issue.id}>
              <button
                type="button"
                disabled={ferme}
                onClick={() => {
                  setIssueOuverte(issue.id);
                  setOuvert(true);
                }}
                className="w-full rounded-[var(--radius-md)] border bg-[var(--card)] p-3 text-left
                           transition-[transform,background-color] enabled:active:scale-[0.99]
                           enabled:hover:bg-[var(--muted)] disabled:opacity-70"
                style={gagnante ? { borderColor: couleurIssue(i), borderWidth: 2 } : undefined}
              >
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-[4px]"
                        style={{ background: couleurIssue(i) }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                    {issue.label}
                    {gagnante && (
                      <span className="ml-1.5 text-[12px] font-semibold"
                            style={{ color: couleurIssue(i) }}>
                        gagnante
                      </span>
                    )}
                  </span>
                  <span className="tabular text-[15px] font-bold" style={{ color: couleurIssue(i) }}>
                    {formatPourcentage(parts[i])}
                  </span>
                </div>

                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
                  <div className="h-full rounded-full transition-[width] duration-500"
                       style={{ width: `${parts[i] * 100}%`, background: couleurIssue(i) }} />
                </div>

                <div className="tabular mt-1.5 flex justify-between text-[11px] text-[var(--muted-foreground)]">
                  <span>
                    {formatCentimes(issue.mises)} misés · {issue.parieurs}{" "}
                    {issue.parieurs > 1 ? "parieurs" : "parieur"}
                  </span>
                  {issue.ma_mise > 0 && (
                    <span className="font-medium text-[var(--foreground)]">
                      vous : {formatCentimes(issue.ma_mise)}
                    </span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {!ferme && (
        <button
          type="button"
          onClick={() => {
            setIssueOuverte(issues[0]?.id ?? null);
            setOuvert(true);
          }}
          className="mt-4 w-full rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-3.5
                     text-[15px] font-semibold text-[var(--primary-foreground)]"
        >
          Parier
        </button>
      )}

      <FeuillePari
        marche={marche}
        solde={solde}
        ouvert={ouvert}
        issueInitiale={issueOuverte}
        onFermer={() => setOuvert(false)}
      />
    </>
  );
}
