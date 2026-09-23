import { FormulaireMarche } from "@/components/AdminMarches";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CarteMarche } from "@/components/CarteMarche";
import { SqueletteCarte } from "@/components/Squelettes";
import { formatCentimes } from "@/lib/money";
import { listerMarches, soldeCentimes } from "@/lib/queries";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PageMarche() {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");

  return (
    <main className="py-4 lg:py-7">
      <header className="page-heading mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold leading-tight lg:text-[32px]">Marché</h1>
          <p className="mt-1 text-[13px] text-[var(--muted-foreground)] lg:text-[15px]">Salut {u.display_name}</p>
        </div>
        <Suspense fallback={<div className="skeleton h-9 w-24 rounded-full" />}>
          <PastilleSolde userId={u.id} />
        </Suspense>
      </header>

      <div className="mb-6 max-w-[640px]"><FormulaireMarche proposition /></div>
      <Suspense fallback={
        <div className="page-grid page-grid--two" aria-busy="true" aria-live="polite">
          <span className="sr-only">Chargement des marchés…</span>
          <SqueletteCarte /><SqueletteCarte /><SqueletteCarte /><SqueletteCarte />
        </div>
      }>
        <Fil userId={u.id} />
      </Suspense>
    </main>
  );
}

async function PastilleSolde({ userId }: { userId: string }) {
  const solde = await soldeCentimes(userId);
  return (
    <Link
      href="/profil"
      className="tabular shrink-0 rounded-full bg-[var(--secondary)] px-3.5 py-2 text-[14px]
                 font-semibold text-[var(--secondary-foreground)]"
    >
      {formatCentimes(solde)}
    </Link>
  );
}

async function Fil({ userId }: { userId: string }) {
  const marches = await listerMarches(userId);

  if (marches.length === 0) {
    return (
      <div className="app-surface rounded-[var(--radius-lg)] border border-dashed p-8 text-center">
        <p className="text-[15px] font-medium">Aucun marché pour l’instant</p>
        <p className="mt-1 text-[13px] text-[var(--muted-foreground)]">
          Les marchés sont créés par les administrateurs de la classe.
        </p>
      </div>
    );
  }

  const ouverts = marches.filter((m) => m.status === "open");
  const autres = marches.filter((m) => m.status !== "open");

  return (
    <div className="page-stack">
      {ouverts.length > 0 && (
        <section className="page-grid page-grid--two items-start">
          {ouverts.map((m) => <CarteMarche key={m.id} marche={m} />)}
        </section>
      )}

      {autres.length > 0 && (
        <section>
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Terminés
          </h2>
          <div className="page-grid page-grid--two items-start">
            {autres.map((m) => <CarteMarche key={m.id} marche={m} />)}
          </div>
        </section>
      )}
    </div>
  );
}
