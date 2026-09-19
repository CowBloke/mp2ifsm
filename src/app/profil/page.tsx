import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Portefeuille } from "@/components/Portefeuille";
import { ReglagePartageStats } from "@/components/ReglagesProfil";
import { SquelettePortefeuille, SqueletteListe } from "@/components/Squelettes";
import { deconnexion } from "@/lib/actions";
import { formatCentimes, tempsRestant } from "@/lib/money";
import {
  mouvements, positionsOuvertes, positionsReglees, soldeCentimes,
} from "@/lib/queries";
import { utilisateurCourant } from "@/lib/session";
import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PageMoi() {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");

  return (
    <main className="py-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold leading-tight">{u.display_name}</h1>
          <p className="text-[13px] text-[var(--muted-foreground)]">{u.email}</p>
        </div>
        <form action={deconnexion}>
          <button
            type="submit"
            className="rounded-[var(--radius-md)] border px-3 py-2 text-[13px] font-medium
                       transition-colors hover:bg-[var(--muted)]"
          >
            Déconnexion
          </button>
        </form>
      </header>

      <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide
                     text-[var(--muted-foreground)]">
        Marché — portefeuille
      </h2>
      <Suspense fallback={<SquelettePortefeuille />}>
        <Solde userId={u.id} />
      </Suspense>

      <Suspense fallback={<div className="mt-6"><SqueletteListe n={1} /></div>}>
        <Reglages userId={u.id} estAdmin={u.role === "admin"} />
      </Suspense>

      <Suspense fallback={<div className="mt-6"><SqueletteListe n={3} /></div>}>
        <Positions userId={u.id} />
      </Suspense>
    </main>
  );
}

async function Reglages({ userId, estAdmin }: { userId: string; estAdmin: boolean }) {
  const r = await queryOne<{ partage_stats: boolean }>(
    `select partage_stats from app_user where id = $1::uuid`, [userId]);

  return (
    <section className="mt-6">
      <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide
                     text-[var(--muted-foreground)]">
        Réglages
      </h2>
      <ReglagePartageStats initial={r?.partage_stats ?? false} />
      {estAdmin && (
        <Link href="/admin"
              className="mt-2 block rounded-[var(--radius-md)] border bg-[var(--card)] p-3
                         text-[14px] font-medium transition-colors hover:bg-[var(--muted)]">
          Administration du marché →
        </Link>
      )}
    </section>
  );
}

async function Solde({ userId }: { userId: string }) {
  const solde = await soldeCentimes(userId);
  return <Portefeuille solde={solde} />;
}

async function Positions({ userId }: { userId: string }) {
  const [ouvertes, reglees, relevé] = await Promise.all([
    positionsOuvertes(userId),
    positionsReglees(userId),
    mouvements(userId, 30),
  ]);

  return (
    <>
      <Section titre="Positions en cours" vide="Aucune mise en cours.">
        {ouvertes.map((p) => (
          <Link
            key={p.bet_id}
            href={`/marche/${p.slug}`}
            className="block rounded-[var(--radius-md)] border bg-[var(--card)] p-3
                       transition-colors hover:bg-[var(--muted)]"
          >
            <p className="truncate text-[13px] font-medium">{p.question}</p>
            <div className="tabular mt-1 flex justify-between text-[12px] text-[var(--muted-foreground)]">
              <span>{p.outcome_label}</span>
              <span className="font-semibold text-[var(--foreground)]">
                {formatCentimes(p.amount)}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
              {p.status === "open" ? `Ferme dans ${tempsRestant(p.closes_at)}`
                                   : "Fermé — en attente de résolution"}
            </p>
          </Link>
        ))}
      </Section>

      <Section titre="Historique" vide="Aucun marché réglé pour l’instant.">
        {reglees.map((p) => {
          const gain = p.payout ?? 0;
          const net = gain - p.amount;
          return (
            <Link
              key={p.bet_id}
              href={`/marche/${p.slug}`}
              className="block rounded-[var(--radius-md)] border bg-[var(--card)] p-3
                         transition-colors hover:bg-[var(--muted)]"
            >
              <p className="truncate text-[13px] font-medium">{p.question}</p>
              <div className="tabular mt-1 flex justify-between text-[12px]">
                <span className="text-[var(--muted-foreground)]">
                  {p.outcome_label} · {formatCentimes(p.amount)} misés
                </span>
                <span
                  className="font-semibold"
                  style={{ color: net >= 0 ? "var(--outcome-1)" : "var(--outcome-2)" }}
                >
                  {net >= 0 ? "+" : ""}{formatCentimes(net)}
                </span>
              </div>
            </Link>
          );
        })}
      </Section>

      <Section titre="Relevé du compte" vide="Aucun mouvement.">
        <ul className="divide-y rounded-[var(--radius-md)] border bg-[var(--card)]">
          {relevé.map((m) => (
            <li key={`${m.id}-${m.kind}`} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium">{LIBELLES[m.kind] ?? m.kind}</p>
                <p className="truncate text-[11px] text-[var(--muted-foreground)]">
                  {m.question ?? m.memo ?? "—"} ·{" "}
                  {new Date(m.created_at).toLocaleDateString("fr-FR", {
                    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                  })}
                </p>
              </div>
              <span
                className="tabular shrink-0 text-[13px] font-semibold"
                style={{ color: m.amount >= 0 ? "var(--outcome-1)" : "var(--foreground)" }}
              >
                {m.amount >= 0 ? "+" : ""}{formatCentimes(m.amount)}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

const LIBELLES: Record<string, string> = {
  deposit: "Dépôt",
  withdrawal: "Retrait",
  bet: "Mise",
  payout: "Gain",
  refund: "Remboursement",
};

function Section({
  titre, vide, children,
}: {
  titre: string; vide: string; children: React.ReactNode;
}) {
  const liste = Array.isArray(children) ? children : [children];
  const estVide = liste.flat().filter(Boolean).length === 0
    || (liste.length === 1 && Array.isArray(liste[0]) && liste[0].length === 0);

  return (
    <section className="mt-6">
      <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        {titre}
      </h2>
      {estVide ? (
        <p className="rounded-[var(--radius-md)] border border-dashed p-4 text-center text-[13px]
                      text-[var(--muted-foreground)]">
          {vide}
        </p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </section>
  );
}
