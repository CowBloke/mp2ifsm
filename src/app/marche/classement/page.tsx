import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SqueletteListe } from "@/components/Squelettes";
import { formatCentimes } from "@/lib/money";
import { classement } from "@/lib/queries";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PageClassement() {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");

  return (
    <main className="py-4">
      <h1 className="text-[22px] font-bold leading-tight">Classement</h1>
      <p className="mb-4 text-[13px] text-[var(--muted-foreground)]">
        Classé par gain net, pas par solde : déposer plus ne fait pas monter.
      </p>

      <Suspense fallback={<SqueletteListe n={8} />}>
        <Tableau moi={u.id} />
      </Suspense>
    </main>
  );
}

async function Tableau({ moi }: { moi: string }) {
  const lignes = await classement();

  if (lignes.length === 0) {
    return (
      <p className="rounded-[var(--radius-md)] border border-dashed p-6 text-center text-[13px]
                    text-[var(--muted-foreground)]">
        Personne n’a encore parié.
      </p>
    );
  }

  return (
    <ol className="divide-y overflow-hidden rounded-[var(--radius-lg)] border bg-[var(--card)]">
      {lignes.map((l, i) => {
        const cestMoi = l.user_id === moi;
        return (
          <li
            key={l.user_id}
            className={`flex items-center gap-3 p-3 ${cestMoi ? "bg-[var(--secondary)]/40" : ""}`}
          >
            <span
              className={`tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-full
                          text-[12px] font-bold ${
                            i < 3
                              ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                              : "bg-[var(--muted)] text-[var(--muted-foreground)]"
                          }`}
            >
              {i + 1}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium">
                {l.display_name}
                {cestMoi && (
                  <span className="ml-1.5 text-[11px] text-[var(--muted-foreground)]">vous</span>
                )}
              </p>
              <p className="tabular text-[11px] text-[var(--muted-foreground)]">
                {l.paris} pari{l.paris > 1 ? "s" : ""}
                {l.engage > 0 && ` · ${formatCentimes(l.engage)} engagés`}
              </p>
            </div>

            <span
              className="tabular shrink-0 text-[15px] font-bold"
              style={{ color: l.resultat >= 0 ? "var(--outcome-1)" : "var(--outcome-2)" }}
            >
              {l.resultat >= 0 ? "+" : ""}{formatCentimes(l.resultat)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
