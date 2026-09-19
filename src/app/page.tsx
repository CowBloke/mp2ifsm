import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SqueletteCarte, SqueletteListe } from "@/components/Squelettes";
import { FormulaireEcheance } from "@/components/Echeances";
import { formatCentimes, tempsRestant } from "@/lib/money";
import { formatTaille } from "@/lib/stockage";
import { resumeFiches, marchesBientotFermes } from "@/lib/dashboard";
import { documentsRecents } from "@/lib/documents";
import { echeancesAVenir, quand } from "@/lib/echeances";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";

/*
 * Accueil = tableau de bord, pas page de présentation.
 *
 * Quatre cartes de même poids visuel : révisions du jour, derniers
 * documents, échéances, marchés qui ferment. Chacune est enveloppée
 * dans son propre Suspense, donc une requête lente n'empêche pas les
 * autres de s'afficher.
 */
export default async function Accueil() {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");

  const heure = new Date().getHours();
  const salutation = heure < 5 ? "Bonne nuit" : heure < 18 ? "Bonjour" : "Bonsoir";

  return (
    <main className="py-4">
      <header className="mb-4">
        <h1 className="text-[22px] font-bold leading-tight">
          {salutation}, {u.display_name}
        </h1>
        <p className="text-[13px] text-[var(--muted-foreground)]">
          {new Date().toLocaleDateString("fr-FR", {
            weekday: "long", day: "numeric", month: "long",
          })}
        </p>
      </header>

      <div className="space-y-3">
        <Suspense fallback={<SqueletteCarte />}>
          <CarteRevisions userId={u.id} />
        </Suspense>

        <Suspense fallback={<SqueletteCarte />}>
          <CarteEcheances />
        </Suspense>

        <Suspense fallback={<SqueletteCarte />}>
          <CarteDocuments />
        </Suspense>

        <Suspense fallback={<SqueletteCarte />}>
          <CarteMarches userId={u.id} />
        </Suspense>
      </div>
    </main>
  );
}

/* Enveloppe commune : même cadre pour les quatre rubriques. */
function Bloc({
  titre, lien, lienLabel, children,
}: {
  titre: string; lien?: string; lienLabel?: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-lg)] border bg-[var(--card)] p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide
                       text-[var(--muted-foreground)]">
          {titre}
        </h2>
        {lien && (
          <Link href={lien} className="text-[12px] font-medium text-[var(--primary)]">
            {lienLabel ?? "Tout voir"}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

async function CarteRevisions({ userId }: { userId: string }) {
  const r = await resumeFiches(userId);
  const total = r.a_reviser + r.nouvelles;
  const cible = r.prochain_paquet ? `/fiches/${r.prochain_paquet.slug}/reviser` : "/fiches";

  return (
    <Bloc titre="Révisions du jour" lien="/fiches" lienLabel="Tous les paquets">
      {total === 0 ? (
        <div className="py-1">
          <p className="text-[15px] font-semibold">Rien à réviser</p>
          <p className="mt-0.5 text-[13px] text-[var(--muted-foreground)]">
            {r.revises_aujourdhui > 0
              ? `${r.revises_aujourdhui} carte${r.revises_aujourdhui > 1 ? "s" : ""} révisée${r.revises_aujourdhui > 1 ? "s" : ""} aujourd’hui. À demain.`
              : `${r.paquets} paquet${r.paquets > 1 ? "s" : ""} disponible${r.paquets > 1 ? "s" : ""}.`}
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-end gap-3">
            <span className="tabular text-[34px] font-bold leading-none">{total}</span>
            <span className="pb-1 text-[13px] text-[var(--muted-foreground)]">
              carte{total > 1 ? "s" : ""} à voir
            </span>
          </div>

          <div className="tabular mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]
                          text-[var(--muted-foreground)]">
            {r.a_reviser > 0 && <span>{r.a_reviser} à revoir</span>}
            {r.nouvelles > 0 && <span>{r.nouvelles} nouvelle{r.nouvelles > 1 ? "s" : ""}</span>}
            {r.revises_aujourdhui > 0 && <span>{r.revises_aujourdhui} déjà faites</span>}
          </div>

          <Link
            href={cible}
            className="mt-3 block rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-3
                       text-center text-[14px] font-semibold text-[var(--primary-foreground)]"
          >
            {r.prochain_paquet ? `Réviser — ${r.prochain_paquet.titre}` : "Commencer"}
          </Link>
        </>
      )}
    </Bloc>
  );
}

async function CarteEcheances() {
  const liste = await echeancesAVenir(4);

  return (
    <Bloc titre="Prochaines échéances">
      {liste.length === 0 ? (
        <p className="text-[13px] text-[var(--muted-foreground)]">
          Aucune échéance enregistrée.
        </p>
      ) : (
        <ul className="space-y-2">
          {liste.map((e) => {
            const proche = new Date(e.due_at).getTime() - Date.now() < 3 * 86_400_000;
            return (
              <li key={e.id} className="flex items-start gap-2.5">
                <span
                  className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold
                             uppercase tracking-wide"
                  style={{
                    background: proche
                      ? "color-mix(in oklab, var(--outcome-2) 15%, transparent)"
                      : "var(--muted)",
                    color: proche ? "var(--outcome-2)" : "var(--muted-foreground)",
                  }}
                >
                  {e.kind}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{e.titre}</p>
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    {e.matiere ? `${e.matiere} · ` : ""}{quand(e.due_at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <FormulaireEcheance />
    </Bloc>
  );
}

async function CarteDocuments() {
  const docs = await documentsRecents(4);

  return (
    <Bloc titre="Documents récents" lien="/documents">
      {docs.length === 0 ? (
        <p className="text-[13px] text-[var(--muted-foreground)]">
          Aucun document déposé pour l’instant.
        </p>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li key={d.id}>
              <Link
                href={`/documents?doc=${d.id}`}
                className="flex items-center gap-2.5 rounded-[var(--radius-sm)]
                           hover:bg-[var(--muted)]"
              >
                <span className="shrink-0 text-[var(--muted-foreground)]" aria-hidden>
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none"
                       stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
                    <path d="M13 3H6v18h12V8zM13 3v5h5" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px]">{d.original_name}</span>
                <span className="tabular shrink-0 text-[11px] text-[var(--muted-foreground)]">
                  {formatTaille(d.taille)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Bloc>
  );
}

async function CarteMarches({ userId }: { userId: string }) {
  const marches = await marchesBientotFermes(userId, 3);

  return (
    <Bloc titre="Marchés qui ferment bientôt" lien="/marche">
      {marches.length === 0 ? (
        <p className="text-[13px] text-[var(--muted-foreground)]">
          Aucun marché ouvert.
        </p>
      ) : (
        <ul className="space-y-2">
          {marches.map((m) => (
            <li key={m.id}>
              <Link
                href={`/marche/${m.slug}`}
                className="block rounded-[var(--radius-sm)] hover:bg-[var(--muted)]"
              >
                <p className="truncate text-[13px] font-medium">{m.question}</p>
                <p className="tabular text-[11px] text-[var(--muted-foreground)]">
                  ferme dans {tempsRestant(m.closes_at)} · cagnotte{" "}
                  {formatCentimes(m.cagnotte)}
                  {m.ma_mise > 0 && ` · vous : ${formatCentimes(m.ma_mise)}`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Bloc>
  );
}
