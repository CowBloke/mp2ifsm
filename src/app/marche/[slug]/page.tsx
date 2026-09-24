import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PanneauPari } from "@/components/PanneauPari";
import { SqueletteCarte } from "@/components/Squelettes";
import { formatCentimes, tempsRestant } from "@/lib/money";
import { lireMarche, soldeCentimes } from "@/lib/queries";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PageMarche({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");

  return (
    <main className="py-4 lg:py-7">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--muted-foreground)]
                   hover:text-[var(--foreground)]"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m15 18-6-6 6-6" />
        </svg>
        Marchés
      </Link>

      <Suspense fallback={<div className="mt-4"><SqueletteCarte /></div>}>
        <Detail slug={slug} userId={u.id} />
      </Suspense>
    </main>
  );
}

async function Detail({ slug, userId }: { slug: string; userId: string }) {
  const [marche, solde] = await Promise.all([
    lireMarche(slug, userId),
    soldeCentimes(userId),
  ]);
  if (!marche) notFound();

  const ferme = marche.status !== "open";
  const gagnante = (marche.issues ?? []).find((i) => i.id === marche.resolved_outcome_id);

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start">
      <div className="min-w-0">
      <header className="page-heading">
      <div className="flex items-center gap-2 text-[12px]">
        <span
          className={`rounded-full px-2 py-0.5 font-medium ${
            ferme
              ? "bg-[var(--muted)] text-[var(--muted-foreground)]"
              : "bg-[var(--secondary)] text-[var(--secondary-foreground)]"
          }`}
        >
          {marche.status === "resolved" ? "Résolu"
            : marche.status === "cancelled" ? "Annulé"
            : marche.status === "closed" ? "Fermé — en attente de résolution"
            : `Ferme dans ${tempsRestant(marche.closes_at)}`}
        </span>
      </div>

      <h1 className="mt-2 text-[22px] font-bold leading-snug lg:text-[30px]">{marche.question}</h1>

      {marche.description && (
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--muted-foreground)]">
          {marche.description}
        </p>
      )}
      </header>

      <dl className="app-surface tabular mt-5 grid grid-cols-3 gap-2 rounded-[var(--radius-lg)] border
                     p-3 text-center">
        <div>
          <dt className="text-[11px] text-[var(--muted-foreground)]">Cagnotte</dt>
          <dd className="text-[15px] font-bold">{formatCentimes(marche.cagnotte)}</dd>
        </div>
        <div className="border-x">
          <dt className="text-[11px] text-[var(--muted-foreground)]">Parieurs</dt>
          <dd className="text-[15px] font-bold">{marche.parieurs}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-[var(--muted-foreground)]">Votre mise</dt>
          <dd className="text-[15px] font-bold">{formatCentimes(marche.ma_mise)}</dd>
        </div>
      </dl>

      {marche.status === "resolved" && (
        <div className="app-surface mt-4 rounded-[var(--radius-md)] border p-4">
          <p className="text-[13px]">
            Issue retenue : <strong>{gagnante?.label ?? "—"}</strong>
          </p>
          {marche.ma_mise > 0 && (
            <p className="tabular mt-1 text-[13px] text-[var(--muted-foreground)]">
              Vous avez misé {formatCentimes(marche.ma_mise)} et reçu{" "}
              <strong className="text-[var(--foreground)]">
                {formatCentimes(marche.mon_gain ?? 0)}
              </strong>
              .
            </p>
          )}
        </div>
      )}
      </div>

      <div className="min-w-0">
      <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wide
                     text-[var(--muted-foreground)]">
        {ferme ? "Issues" : "Sur quoi misez-vous ?"}
      </h2>

      <PanneauPari marche={marche} solde={solde} />

      <section className="app-surface mt-6 rounded-[var(--radius-md)] border bg-[var(--muted)]/40 p-4">
        <h3 className="text-[12px] font-semibold">Comment le gain est calculé</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted-foreground)]">
          Toutes les mises vont dans une cagnotte commune. À la résolution, elle
          est partagée entre les gagnants au prorata de leur mise :{" "}
          <strong className="text-[var(--foreground)]">
            gain = mise × cagnotte ÷ total misé sur l’issue gagnante
          </strong>
          . La cagnotte est redistribuée intégralement — rien n’est prélevé.
          Une mise est définitive : elle ne peut pas être revendue ni annulée.
        </p>
      </section>
      </div>
    </div>
  );
}
