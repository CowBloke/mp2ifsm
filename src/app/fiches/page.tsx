import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SqueletteListe } from "@/components/Squelettes";
import { OutilsPaquets } from "@/components/OutilsFiches";
import { listerPaquets } from "@/lib/fiches";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PageFiches() {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");

  return (
    <main className="py-4">
      <h1 className="text-[22px] font-bold leading-tight">Fiches</h1>
      <p className="mb-4 text-[13px] text-[var(--muted-foreground)]">
        Les paquets appartiennent à la classe ; votre progression est personnelle.
      </p>

      <OutilsPaquets />

      <Suspense fallback={<div className="mt-4"><SqueletteListe n={5} /></div>}>
        <Liste userId={u.id} />
      </Suspense>
    </main>
  );
}

async function Liste({ userId }: { userId: string }) {
  const paquets = await listerPaquets(userId);

  if (paquets.length === 0) {
    return (
      <div className="mt-4 rounded-[var(--radius-lg)] border border-dashed p-8 text-center">
        <p className="text-[15px] font-medium">Aucun paquet</p>
        <p className="mt-1 text-[13px] text-[var(--muted-foreground)]">
          Créez-en un, ou importez un paquet Anki existant.
        </p>
      </div>
    );
  }

  // Groupés par matière : c'est l'entrée naturelle quand on révise.
  const parMatiere = new Map<string, typeof paquets>();
  for (const p of paquets) {
    const liste = parMatiere.get(p.matiere) ?? [];
    liste.push(p);
    parMatiere.set(p.matiere, liste);
  }

  return (
    <div className="mt-5 space-y-5">
      {[...parMatiere.entries()].map(([matiere, liste]) => (
        <section key={matiere}>
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide
                         text-[var(--muted-foreground)]">
            {matiere}
          </h2>
          <ul className="space-y-2">
            {liste.map((p) => {
              const du = p.apprentissage + p.a_revoir + p.nouvelles;
              return (
                <li key={p.id}>
                  <Link
                    href={`/fiches/${p.slug}`}
                    className="block rounded-[var(--radius-md)] border bg-[var(--card)] p-3
                               transition-colors hover:bg-[var(--muted)]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-medium">{p.titre}</p>
                        <p className="truncate text-[11px] text-[var(--muted-foreground)]">
                          {p.chapitre} · {p.total} carte{p.total > 1 ? "s" : ""}
                        </p>
                      </div>
                      {du > 0 ? (
                        <span className="tabular shrink-0 rounded-full bg-[var(--primary)] px-2.5
                                         py-1 text-[12px] font-bold text-[var(--primary-foreground)]">
                          {du}
                        </span>
                      ) : (
                        <span className="shrink-0 text-[11px] text-[var(--muted-foreground)]">à jour</span>
                      )}
                    </div>

                    {du > 0 && (
                      <div className="tabular mt-2 flex gap-3 text-[11px]">
                        {p.nouvelles > 0 && (
                          <span style={{ color: "var(--outcome-3)" }}>{p.nouvelles} nouvelles</span>
                        )}
                        {p.apprentissage > 0 && (
                          <span style={{ color: "var(--outcome-2)" }}>{p.apprentissage} en cours</span>
                        )}
                        {p.a_revoir > 0 && (
                          <span style={{ color: "var(--outcome-1)" }}>{p.a_revoir} à revoir</span>
                        )}
                      </div>
                    )}

                    {p.signalements > 0 && (
                      <p className="mt-1.5 text-[11px] font-medium text-[var(--destructive)]">
                        {p.signalements} carte{p.signalements > 1 ? "s" : ""} signalée
                        {p.signalements > 1 ? "s" : ""}
                      </p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
