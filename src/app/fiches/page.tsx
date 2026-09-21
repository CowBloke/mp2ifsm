import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SqueletteListe } from "@/components/Squelettes";
import { OutilsPaquets } from "@/components/OutilsFiches";
import { BoutonSuivre } from "@/components/BoutonSuivre";
import { PastilleMatiere, styleMatiere } from "@/components/Matiere";
import { listerPaquets, type PaquetVue } from "@/lib/fiches";
import { listerMatieres } from "@/lib/matieres";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PageFiches() {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  const matieres = await listerMatieres();

  return (
    <main className="py-4">
      <h1 className="text-[22px] font-bold leading-tight">Fiches</h1>
      <p className="mb-4 text-[13px] text-[var(--muted-foreground)]">
        Tous les paquets de la classe sont visibles ; seuls ceux que vous suivez
        entrent dans vos révisions et vos statistiques.
      </p>

      <OutilsPaquets matieres={matieres.map(({ id, nom }) => ({ id, nom }))} />

      <Suspense fallback={<div className="mt-4"><SqueletteListe n={5} /></div>}>
        <Liste userId={u.id} />
      </Suspense>
    </main>
  );
}

/** Regroupe par matière en gardant l'ordre de la requête. */
function parMatiere(paquets: PaquetVue[]) {
  const groupes = new Map<string, { nom: string | null; couleur: string | null; paquets: PaquetVue[] }>();
  for (const p of paquets) {
    const cle = String(p.subject_id ?? "");
    const g = groupes.get(cle) ?? { nom: p.matiere, couleur: p.couleur, paquets: [] };
    g.paquets.push(p);
    groupes.set(cle, g);
  }
  return [...groupes.entries()];
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

  const suivis = paquets.filter((p) => p.abonne);
  const autres = paquets.filter((p) => !p.abonne);
  const dus = suivis.reduce((n, p) => n + p.apprentissage + p.a_revoir + p.nouvelles, 0);

  return (
    <div className="mt-5 space-y-6">
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Mes paquets ({suivis.length})
          </h2>
          {dus > 0 && (
            <span className="tabular text-[12px] font-medium">{dus} carte{dus > 1 ? "s" : ""} à voir</span>
          )}
        </div>
        {suivis.length === 0 ? (
          <p className="rounded-[var(--radius-md)] border border-dashed p-4 text-center text-[13px]
                        text-[var(--muted-foreground)]">
            Vous ne suivez aucun paquet. Choisissez-en ci-dessous avec « + Suivre ».
          </p>
        ) : (
          <div className="space-y-4">
            {parMatiere(suivis).map(([cle, g]) => (
              <div key={cle}>
                <PastilleMatiere nom={g.nom} couleur={g.couleur} className="mb-1.5" />
                <ul className="space-y-1.5">
                  {g.paquets.map((p) => <LignePaquetSuivi key={p.id} p={p} />)}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {autres.length > 0 && (
        <section>
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Autres paquets de la classe ({autres.length})
          </h2>
          <div className="space-y-4">
            {parMatiere(autres).map(([cle, g]) => (
              <div key={cle}>
                <PastilleMatiere nom={g.nom} couleur={g.couleur} className="mb-1.5" />
                <ul className="divide-y rounded-[var(--radius-md)] border bg-[var(--card)]">
                  {g.paquets.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 px-3 py-2">
                      <Link href={`/fiches/${p.slug}`} className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{p.titre}</p>
                        <p className="truncate text-[11px] text-[var(--muted-foreground)]">
                          {p.chapitre} · {p.total} carte{p.total > 1 ? "s" : ""}
                        </p>
                      </Link>
                      <BoutonSuivre deckId={p.id} abonne={false} compact />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function LignePaquetSuivi({ p }: { p: PaquetVue }) {
  const du = p.apprentissage + p.a_revoir + p.nouvelles;
  return (
    <li>
      <Link
        href={`/fiches/${p.slug}`}
        style={styleMatiere(p.couleur)}
        className="m-liseret block rounded-[var(--radius-md)] border bg-[var(--card)] py-2 pl-3.5 pr-3
                   transition-colors hover:bg-[var(--muted)]"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium">{p.titre}</p>
            <p className="tabular truncate text-[11px] text-[var(--muted-foreground)]">
              {p.chapitre} · {p.total} carte{p.total > 1 ? "s" : ""}
              {p.nouvelles > 0 && <span style={{ color: "var(--outcome-3)" }}> · {p.nouvelles} nouv.</span>}
              {p.apprentissage > 0 && <span style={{ color: "var(--outcome-2)" }}> · {p.apprentissage} en cours</span>}
              {p.a_revoir > 0 && <span style={{ color: "var(--outcome-1)" }}> · {p.a_revoir} à revoir</span>}
            </p>
          </div>
          {du > 0 ? (
            <span className="m-plein tabular shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-bold
                             text-[var(--card)]">
              {du}
            </span>
          ) : (
            <span className="shrink-0 text-[11px] text-[var(--muted-foreground)]">à jour</span>
          )}
        </div>
        {p.signalements > 0 && (
          <p className="mt-1 text-[11px] font-medium text-[var(--destructive)]">
            {p.signalements} carte{p.signalements > 1 ? "s" : ""} signalée{p.signalements > 1 ? "s" : ""}
          </p>
        )}
      </Link>
    </li>
  );
}
