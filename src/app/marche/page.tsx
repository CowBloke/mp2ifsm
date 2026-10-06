import { FormulaireMarche } from "@/components/AdminMarches";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CarteMarche } from "@/components/CarteMarche";
import { SqueletteFil } from "@/components/Squelettes";
import { formatCentimes } from "@/lib/money";
import { listerMarches, soldeCentimes } from "@/lib/queries";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PageMarche() {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");

  return (
    <main>
      <header className="page-heading">
        <h1>Marché</h1>
        <Suspense fallback={<div className="skeleton h-9 w-24 rounded-full" />}>
          <PastilleSolde userId={u.id} />
        </Suspense>
      </header>

      <Suspense fallback={<SqueletteFil />}>
        <Fil userId={u.id} />
      </Suspense>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-2">
        <FormulaireMarche proposition />
        <Link href="/marche/classement" className="lien-discret">Classement</Link>
      </div>
    </main>
  );
}

async function PastilleSolde({ userId }: { userId: string }) {
  const solde = await soldeCentimes(userId);
  return (
    <Link
      href="/profil"
      className="solde shrink-0" aria-label={`Solde : ${formatCentimes(solde)}`}
    >
      {formatCentimes(solde)}
    </Link>
  );
}

async function Fil({ userId }: { userId: string }) {
  const marches = await listerMarches(userId);

  if (marches.length === 0) {
    return (
      <p className="text-[15px] text-[var(--muted-foreground)]">
        Aucun marché pour l’instant. Proposez un pari ci-dessous.
      </p>
    );
  }

  const ouverts = marches.filter((m) => m.status === "open");
  const autres = marches.filter((m) => m.status !== "open");

  return (
    <div className="page-stack">
      {ouverts.length > 0 && (
        <section aria-label="Marchés ouverts">
          {ouverts.map((m) => <CarteMarche key={m.id} marche={m} />)}
        </section>
      )}
      {autres.length > 0 && (
        <section aria-labelledby="termines">
          <h2 id="termines" className="etiquette">Terminés</h2>
          {autres.map((m) => <CarteMarche key={m.id} marche={m} />)}
        </section>
      )}
    </div>
  );
}
