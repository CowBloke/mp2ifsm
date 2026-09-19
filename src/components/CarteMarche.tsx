import Link from "next/link";
import { couleurIssue } from "./couleurs";
import { BarreCotes } from "./BarreCotes";
import {
  cotesImplicites, formatCentimes, formatPourcentage, tempsRestant,
} from "@/lib/money";
import type { MarcheVue } from "@/lib/queries";

/*
 * Carte du fil d'accueil. Elle doit se lire d'un coup d'oeil au pouce :
 * question, cotes, cagnotte, temps restant, et la position du membre
 * s'il en a une.
 */
export function CarteMarche({ marche }: { marche: MarcheVue }) {
  const issues = marche.issues ?? [];
  const parts = cotesImplicites(issues.map((i) => i.mises));
  const ferme = marche.status !== "open";
  const regle = marche.status === "resolved";
  const gagnante = issues.find((i) => i.id === marche.resolved_outcome_id);

  return (
    <Link
      href={`/marche/${marche.slug}`}
      className="block rounded-[var(--radius-lg)] border bg-[var(--card)] p-4
                 transition-[transform,box-shadow] active:scale-[0.99]
                 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
    >
      <div className="flex items-center justify-between gap-3 text-xs">
        <span
          className={`inline-flex items-center gap-1.5 font-medium ${
            ferme ? "text-[var(--muted-foreground)]" : "text-[var(--primary)]"
          }`}
        >
          {!ferme && (
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" aria-hidden />
          )}
          {regle ? "Résolu" : marche.status === "cancelled" ? "Annulé"
            : ferme ? "Fermé" : tempsRestant(marche.closes_at)}
        </span>
        <span className="tabular text-[var(--muted-foreground)]">
          {formatCentimes(marche.cagnotte)} · {marche.parieurs}{" "}
          {marche.parieurs > 1 ? "parieurs" : "parieur"}
        </span>
      </div>

      <h2 className="mt-2 text-[15px] font-semibold leading-snug">{marche.question}</h2>

      <div className="mt-3">
        <BarreCotes parts={parts} labels={issues.map((i) => i.label)} />
      </div>

      <ul className="mt-3 space-y-1.5">
        {issues.map((issue, i) => {
          const estGagnante = regle && issue.id === marche.resolved_outcome_id;
          return (
            <li key={issue.id} className="flex items-center gap-2 text-[13px]">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={{ background: couleurIssue(i) }}
                aria-hidden
              />
              <span className={`min-w-0 flex-1 truncate ${estGagnante ? "font-semibold" : ""}`}>
                {issue.label}
                {estGagnante && " ✓"}
              </span>
              {issue.ma_mise > 0 && (
                <span className="shrink-0 rounded-full bg-[var(--secondary)] px-2 py-0.5
                                 text-[11px] font-medium text-[var(--secondary-foreground)] tabular">
                  {formatCentimes(issue.ma_mise)}
                </span>
              )}
              <span className="tabular w-11 shrink-0 text-right font-semibold">
                {formatPourcentage(parts[i])}
              </span>
            </li>
          );
        })}
      </ul>

      {marche.ma_mise > 0 && (
        <p className="mt-3 border-t pt-2.5 text-[12px] text-[var(--muted-foreground)]">
          {regle ? (
            <>
              Vous aviez misé{" "}
              <strong className="tabular text-[var(--foreground)]">
                {formatCentimes(marche.ma_mise)}
              </strong>{" "}
              · gain{" "}
              <strong
                className="tabular"
                style={{
                  color: (marche.mon_gain ?? 0) >= marche.ma_mise
                    ? "var(--outcome-1)" : "var(--outcome-2)",
                }}
              >
                {formatCentimes(marche.mon_gain ?? 0)}
              </strong>
              {gagnante && ` · issue « ${gagnante.label} »`}
            </>
          ) : (
            <>
              Votre position :{" "}
              <strong className="tabular text-[var(--foreground)]">
                {formatCentimes(marche.ma_mise)}
              </strong>
            </>
          )}
        </p>
      )}
    </Link>
  );
}
