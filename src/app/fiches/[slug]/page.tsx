import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ListeCartes } from "@/components/ListeCartes";
import { PanneauAjoutCarte } from "@/components/PanneauAjoutCarte";
import { SqueletteListe } from "@/components/Squelettes";
import { BoutonSuivre } from "@/components/BoutonSuivre";
import { MatierePaquet } from "@/components/MatierePaquet";
import { LienRetour } from "@/components/LienRetour";
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
    <main>
      <LienRetour href="/fiches" label="Retour aux fiches" />

      <header className="mb-10 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[14px] text-[var(--muted-foreground)]">
            {paquet.matiere ?? "Sans matière"} · {paquet.chapitre}
          </p>
          <h1 className="titre-page mt-1.5 [overflow-wrap:anywhere]">{paquet.titre}</h1>
          {paquet.description && (
            <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted-foreground)]">{paquet.description}</p>
          )}
          {peutReclasser && (
            <div className="mt-3">
              <MatierePaquet deckId={paquet.id} actuelle={paquet.subject_id} matieres={matieres} />
            </div>
          )}
        </div>
        <BoutonSuivre deckId={paquet.id} abonne={paquet.abonne} />
      </header>

      <div className="page-stack">
        {paquet.abonne ? (
          <section className="flex flex-col gap-8">
            {du > 0 ? (
              <Link href={`/fiches/${paquet.slug}/reviser`} className="bouton-principal">
                Réviser {du} carte{du > 1 ? "s" : ""}
              </Link>
            ) : (
              <p className="text-[15px] text-[var(--muted-foreground)]">Tout est à jour.</p>
            )}
            <Suspense fallback={<SqueletteListe n={2} />}>
              <Statistiques deckId={paquet.id} userId={u.id} slug={paquet.slug} />
            </Suspense>
          </section>
        ) : (
          <p className="text-[15px] leading-relaxed text-[var(--muted-foreground)]">
            Suivez ce paquet pour le réviser. Si vous l’aviez déjà travaillé, votre progression
            reprend là où vous l’aviez laissée.
          </p>
        )}

        <Suspense fallback={null}>
          <Heatmap deckId={paquet.id} />
        </Suspense>

        <section aria-labelledby="cartes">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 id="cartes" className="etiquette">{paquet.total} carte{paquet.total > 1 ? "s" : ""}</h2>
          </div>
          <PanneauAjoutCarte deckId={paquet.id} />
          <div className="mt-3">
            <Suspense fallback={<SqueletteListe n={4} />}>
              <Cartes deckId={paquet.id} userId={u.id} estAdmin={u.role === "admin"} />
            </Suspense>
          </div>
        </section>
      </div>
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
        versoHtml: c.verso.trim() === "(vide)" ? "" : rendreContenu(c.verso),
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
    <section aria-label="Vos statistiques" className="min-w-0">
      <dl className="grid grid-cols-3 gap-4">
        <div className="flex flex-col-reverse gap-1">
          <dt className="text-[13px] text-[var(--muted-foreground)]">Rétention</dt>
          <dd className="text-[24px] font-semibold">
            {s.retention === null ? "—" : `${Math.round(s.retention * 100)} %`}
          </dd>
        </div>
        <div className="flex flex-col-reverse gap-1">
          <dt className="text-[13px] text-[var(--muted-foreground)]">Cartes vues</dt>
          <dd className="text-[24px] font-semibold">{s.cartes_vues}/{s.total}</dd>
        </div>
        <div className="flex flex-col-reverse gap-1">
          <dt className="text-[13px] text-[var(--muted-foreground)]">Sur 30 jours</dt>
          <dd className="text-[24px] font-semibold">{s.revisions_30j}</dd>
        </div>
      </dl>

      <p className="etiquette mb-2 mt-8">À réviser cette semaine</p>
      <div className="flex items-end gap-1" role="img"
           aria-label={s.a_venir.map((j) => `${j.jour} : ${j.n}`).join(", ")}>
        {s.a_venir.map((j) => (
          <div key={j.jour} className="flex flex-1 flex-col items-center gap-1">
            <span className="tabular text-[10px] text-[var(--muted-foreground)]">
              {j.n > 0 ? j.n : ""}
            </span>
            <div className="w-full rounded-t-[3px] bg-[var(--foreground)]"
                 style={{ height: `${Math.max(2, (j.n / maxJour) * 44)}px`,
                          opacity: j.n > 0 ? 1 : 0.25 }} />
            <span className="text-[11px] uppercase text-[var(--muted-foreground)]">
              {new Date(`${j.jour}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "narrow" })}
            </span>
          </div>
        ))}
      </div>
      <a href={`/api/fiches/export/${slug}`} className="lien-discret mt-4">Exporter en .apkg</a>
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
    <section aria-labelledby="classe" className="min-w-0">
      <h2 id="classe" className="etiquette mb-3">La classe, 21 derniers jours</h2>

      <div className="space-y-1 overflow-x-auto">
        {lignes.map((l) => {
          const parJour = new Map(l.jours.map((j) => [j.jour, j.n]));
          return (
            <div key={l.user_id} className="flex items-center gap-2">
              <span className="w-24 shrink-0 truncate text-[13px]">{l.display_name}</span>
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
                          : `color-mix(in oklab, var(--primary) ${20 + (n / max) * 80}%, transparent)`,
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
