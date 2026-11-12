import { Suspense } from "react";
import { LienRetour } from "@/components/LienRetour";
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
    <main>
      <LienRetour href="/marche" label="Retour au marché" />
      <Suspense fallback={<SqueletteCarte />}>
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

  const statut = marche.status === "resolved" ? "Résolu"
    : marche.status === "cancelled" ? "Annulé"
    : marche.status === "closed" ? "Fermé — en attente de résolution"
    : `Ferme dans ${tempsRestant(marche.closes_at)}`;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="text-[13px] text-[var(--muted-foreground)]">
          {statut} · cagnotte {formatCentimes(marche.cagnotte)} · {marche.parieurs} parieur{marche.parieurs > 1 ? "s" : ""}
        </p>
        <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.01em]">{marche.question}</h1>
        {marche.description && (
          <p className="text-[15px] leading-relaxed text-[var(--muted-foreground)]">{marche.description}</p>
        )}
      </header>

      {marche.status === "resolved" && marche.ma_mise > 0 && (
        <p className="text-[15px]">
          Vous avez misé {formatCentimes(marche.ma_mise)} et reçu{" "}
          <strong className="font-semibold">{formatCentimes(marche.mon_gain ?? 0)}</strong>.
        </p>
      )}

      <PanneauPari marche={marche} solde={solde} />

      <details className="text-[14px] text-[var(--muted-foreground)]">
        <summary className="min-h-11 cursor-pointer py-3 font-medium text-[var(--foreground)]">
          Comment le gain est calculé
        </summary>
        <p className="leading-relaxed">
          Toutes les mises vont dans une cagnotte commune. À la résolution, elle est partagée entre
          les gagnants au prorata de leur mise : gain = mise × cagnotte ÷ total misé sur l’issue
          gagnante. Rien n’est prélevé, et une mise ne peut être ni revendue ni annulée.
        </p>
      </details>
    </div>
  );
}
