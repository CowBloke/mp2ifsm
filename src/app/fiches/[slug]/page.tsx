import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ListeCartes } from "@/components/ListeCartes";
import { PanneauAjoutCarte } from "@/components/PanneauAjoutCarte";
import { SqueletteListe } from "@/components/Squelettes";
import { BoutonSuivre } from "@/components/BoutonSuivre";
import { MatierePaquet } from "@/components/MatierePaquet";
import { PastilleMatiere } from "@/components/Matiere";
import { listerMatieres } from "@/lib/matieres";
import { heatmapClasse, lirePaquet, listerCartes, statsPaquet } from "@/lib/fiches";
import { rendreContenu } from "@/lib/rendu";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PagePaquet({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");

  const paquet = await lirePaquet(slug, u.id);
  if (!paquet) notFound();

  const du = paquet.nouvelles + paquet.apprentissage + paquet.a_revoir;
  const peutReclasser = u.role === "admin" || paquet.created_by === u.id;
  const matieres = peutReclasser ? await listerMatieres(true) : [];

  return (
    <main className="py-4">
      <Link href="/fiches"
            className="inline-flex items-center gap-1 text-[13px] font-medium
                       text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m15 18-6-6 6-6" />
        </svg>
        Fiches
      </Link>

      <header className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <PastilleMatiere nom={paquet.matiere} couleur={paquet.couleur} />
            <span className="text-[12px] font-medium text-[var(--muted-foreground)]">{paquet.chapitre}</span>
          </div>
          <h1 className="mt-1 text-[19px] font-bold leading-snug">{paquet.titre}</h1>
          {paquet.description && (
            <p className="mt-1 text-[13px] text-[var(--muted-foreground)]">{paquet.description}</p>
          )}
          {peutReclasser && (
            <div className="mt-1.5">
              <MatierePaquet deckId={paquet.id} actuelle={paquet.subject_id} matieres={matieres} />
            </div>
          )}
        </div>
        <BoutonSuivre deckId={paquet.id} abonne={paquet.abonne} />
      </header>

      {paquet.abonne ? (
        <>
          <Link
            href={`/fiches/${paquet.slug}/reviser`}
            className={`mt-4 block rounded-[var(--radius-md)] px-4 py-3.5 text-center text-[15px]
                        font-semibold ${
                          du > 0
                            ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                            : "border text-[var(--muted-foreground)]"
                        }`}
          >
            {du > 0 ? `Réviser ${du} carte${du > 1 ? "s" : ""}` : "Tout est à jour"}
          </Link>

          <Suspense fallback={<div className="mt-5"><SqueletteListe n={2} /></div>}>
            <Statistiques deckId={paquet.id} userId={u.id} slug={paquet.slug} />
          </Suspense>
        </>
      ) : (
        <p className="mt-4 rounded-[var(--radius-md)] border border-dashed p-3 text-[13px]
                      text-[var(--muted-foreground)]">
          Vous ne suivez pas ce paquet : il n’entre ni dans vos révisions, ni dans vos
          statistiques, ni dans vos rappels. Suivez-le pour le réviser — si vous
          l’aviez déjà travaillé, votre progression reprend là où vous l’aviez laissée.
        </p>
      )}

      <Suspense fallback={<div className="mt-5"><SqueletteListe n={2} /></div>}>
        <Heatmap deckId={paquet.id} />
      </Suspense>

      <section className="mt-6">
        <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide
                       text-[var(--muted-foreground)]">
          Cartes ({paquet.total})
        </h2>
        <PanneauAjoutCarte deckId={paquet.id} />
        <div className="mt-3">
          <Suspense fallback={<SqueletteListe n={4} />}>
            <Cartes deckId={paquet.id} userId={u.id} estAdmin={u.role === "admin"} />
          </Suspense>
        </div>
      </section>
    </main>
  );
}

async function Cartes({
  deckId, userId, estAdmin,
}: { deckId: number; userId: string; estAdmin: boolean }) {
  const cartes = await listerCartes(deckId, userId);
  return (
    <ListeCartes
      deckId={deckId}
      moi={userId}
      estAdmin={estAdmin}
      cartes={cartes.map((c) => ({
        ...c,
        rectoHtml: rendreContenu(c.recto),
        versoHtml: rendreContenu(c.verso),
      }))}
    />
  );
}

async function Statistiques({
  deckId, userId, slug,
}: { deckId: number; userId: string; slug: string }) {
  const s = await statsPaquet(deckId, userId);
  const maxJour = Math.max(1, ...s.a_venir.map((j) => j.n));

  return (
    <section className="mt-5 rounded-[var(--radius-lg)] border bg-[var(--card)] p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide
                       text-[var(--muted-foreground)]">
          Vos statistiques
        </h2>
        <a href={`/api/fiches/export/${slug}`}
           className="text-[12px] font-medium text-[var(--primary)]">
          Exporter .apkg
        </a>
      </div>

      <dl className="tabular grid grid-cols-3 gap-2 text-center">
        <div>
          <dt className="text-[11px] text-[var(--muted-foreground)]">Rétention</dt>
          <dd className="text-[17px] font-bold">
            {s.retention === null ? "—" : `${Math.round(s.retention * 100)} %`}
          </dd>
        </div>
        <div className="border-x">
          <dt className="text-[11px] text-[var(--muted-foreground)]">Vues</dt>
          <dd className="text-[17px] font-bold">{s.cartes_vues}/{s.total}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-[var(--muted-foreground)]">30 jours</dt>
          <dd className="text-[17px] font-bold">{s.revisions_30j}</dd>
        </div>
      </dl>

      <p className="mb-1.5 mt-4 text-[11px] font-medium text-[var(--muted-foreground)]">
        À réviser cette semaine
      </p>
      <div className="flex items-end gap-1" role="img"
           aria-label={s.a_venir.map((j) => `${j.jour} : ${j.n}`).join(", ")}>
        {s.a_venir.map((j) => (
          <div key={j.jour} className="flex flex-1 flex-col items-center gap-1">
            <span className="tabular text-[10px] text-[var(--muted-foreground)]">
              {j.n > 0 ? j.n : ""}
            </span>
            <div className="w-full rounded-t-sm bg-[var(--primary)]"
                 style={{ height: `${Math.max(2, (j.n / maxJour) * 44)}px`,
                          opacity: j.n > 0 ? 1 : 0.25 }} />
            <span className="text-[9px] uppercase text-[var(--muted-foreground)]">
              {new Date(`${j.jour}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "narrow" })}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/*
 * Heatmap de classe. `heatmapClasse` filtre sur partage_stats dans le
 * SQL : qui n'a pas consenti n'apparaît pas, même vide.
 */
async function Heatmap({ deckId }: { deckId: number }) {
  const lignes = await heatmapClasse(deckId, 21);
  if (lignes.length === 0) return null;

  const jours = [...Array(21)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (20 - i));
    return d.toISOString().slice(0, 10);
  });
  const max = Math.max(1, ...lignes.flatMap((l) => l.jours.map((j) => j.n)));

  return (
    <section className="mt-5 rounded-[var(--radius-lg)] border bg-[var(--card)] p-4">
      <h2 className="text-[12px] font-semibold uppercase tracking-wide
                     text-[var(--muted-foreground)]">
        Révisions de la classe
      </h2>
      <p className="mb-3 mt-0.5 text-[11px] text-[var(--muted-foreground)]">
        21 derniers jours · membres qui suivent ce paquet et ont activé le partage.
      </p>

      <div className="space-y-1 overflow-x-auto">
        {lignes.map((l) => {
          const parJour = new Map(l.jours.map((j) => [j.jour, j.n]));
          return (
            <div key={l.user_id} className="flex items-center gap-2">
              <span className="w-20 shrink-0 truncate text-[11px]">{l.display_name}</span>
              <div className="flex gap-[2px]">
                {jours.map((j) => {
                  const n = parJour.get(j) ?? 0;
                  return (
                    <span
                      key={j}
                      title={`${l.display_name} — ${j} : ${n} révision${n > 1 ? "s" : ""}`}
                      className="h-3 w-3 rounded-[2px]"
                      style={{
                        background: n === 0
                          ? "var(--muted)"
                          : `color-mix(in oklab, var(--outcome-1) ${20 + (n / max) * 80}%, transparent)`,
                      }}
                    />
                  );
                })}
              </div>
              <span className="tabular ml-auto text-[11px] text-[var(--muted-foreground)]">
                {l.total}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
