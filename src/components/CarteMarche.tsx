import Link from "next/link";
import { cotesImplicites, formatCentimes, formatPourcentage, tempsRestant } from "@/lib/money";
import type { MarcheVue } from "@/lib/queries";

/*
 * Ligne du fil des marchés : question, issue en tête et sa part, votre
 * position s'il y en a une. Un marché terminé tient sur une ligne.
 */
export function CarteMarche({ marche }: { marche: MarcheVue }) {
  const issues = marche.issues ?? [];
  const parts = cotesImplicites(issues.map((i) => i.mises));

  if (marche.status !== "open") {
    const gagnante = issues.find((i) => i.id === marche.resolved_outcome_id);
    return (
      <Link href={`/marche/${marche.slug}`}
            className="flex items-baseline justify-between gap-4 py-3 text-[var(--muted-foreground)]">
        <span className="min-w-0 text-[15px]">{marche.question}</span>
        <span className="shrink-0 text-[14px] font-medium text-[var(--foreground)]">
          {marche.status === "resolved" ? gagnante?.label ?? "Résolu"
            : marche.status === "cancelled" ? "Annulé" : "Fermé"}
        </span>
      </Link>
    );
  }

  const tete = parts.length ? parts.indexOf(Math.max(...parts)) : -1;
  return (
    <Link href={`/marche/${marche.slug}`}
          className="flex flex-col gap-2.5 border-b py-5 last:border-b-0">
      <span className="text-[13px] text-[var(--muted-foreground)]">
        Ferme dans {tempsRestant(marche.closes_at)} · {marche.parieurs}{" "}
        parieur{marche.parieurs > 1 ? "s" : ""}
      </span>
      <span className="text-[17px] font-medium leading-snug">{marche.question}</span>
      {tete >= 0 && marche.cagnotte > 0 && (
        <span className="flex items-center gap-3">
          <span className="barre flex-1"><span style={{ width: `${parts[tete] * 100}%` }} /></span>
          <span className="whitespace-nowrap text-[14px] font-semibold">
            {issues[tete].label} {formatPourcentage(parts[tete])}
          </span>
        </span>
      )}
      {marche.ma_mise > 0 && (
        <span className="text-[13px] font-medium text-[var(--primary)]">
          Votre mise : {formatCentimes(marche.ma_mise)}
        </span>
      )}
    </Link>
  );
}
