import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SqueletteListe } from "@/components/Squelettes";
import { OutilsPaquets } from "@/components/OutilsFiches";
import { BoutonSuivre } from "@/components/BoutonSuivre";
import { styleMatiere } from "@/components/Matiere";
import { listerPaquets, type PaquetVue } from "@/lib/fiches";
import { listerMatieres } from "@/lib/matieres";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PageFiches() {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  const matieres = await listerMatieres();

  return (
    <main>
      <OutilsPaquets matieres={matieres.map(({ id, nom }) => ({ id, nom }))} />
      <Suspense fallback={<SqueletteListe n={5} />}>
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
      <p className="text-[15px] text-[var(--muted-foreground)]">
        Aucun paquet. Créez-en un avec « + », ou importez un paquet Anki.
      </p>
    );
  }

  const suivis = paquets.filter((p) => p.abonne);
  const autres = paquets.filter((p) => !p.abonne);

  return (
    <div className="page-stack">
      {suivis.length === 0 ? (
        <p className="text-[15px] text-[var(--muted-foreground)]">
          Suivez un paquet pour l’ajouter à vos révisions.
        </p>
      ) : (
        parMatiere(suivis).map(([cle, g]) => (
          <section key={cle} aria-label={g.nom ?? "Sans matière"}>
            <h2 className="etiquette flex items-center gap-2" style={styleMatiere(g.couleur)}>
              <span className="m-plein h-2 w-2 rounded-full" aria-hidden />
              {g.nom ?? "Sans matière"}
            </h2>
            <ul>{g.paquets.map((p) => <LignePaquetSuivi key={p.id} p={p} />)}</ul>
          </section>
        ))
      )}

      {autres.length > 0 && (
        <section aria-labelledby="autres">
          <h2 id="autres" className="etiquette">Autres paquets de la classe</h2>
          <ul>
            {autres.map((p) => (
              <li key={p.id} className="ligne">
                <Link href={`/fiches/${p.slug}`} className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="ligne__titre">{p.titre}</span>
                  <span className="ligne__meta">
                    {p.matiere ?? "Sans matière"} · {p.total} carte{p.total > 1 ? "s" : ""}
                  </span>
                </Link>
                <BoutonSuivre deckId={p.id} abonne={false} compact />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function LignePaquetSuivi({ p }: { p: PaquetVue }) {
  const du = p.apprentissage + p.a_revoir + p.nouvelles;
  return (
    <li>
      <Link href={`/fiches/${p.slug}`} className="ligne">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="ligne__titre">{p.titre}</span>
          <span className="ligne__meta">
            {p.total} carte{p.total > 1 ? "s" : ""}
            {p.signalements > 0 && (
              <span className="text-[var(--destructive)]"> · {p.signalements} signalée{p.signalements > 1 ? "s" : ""}</span>
            )}
          </span>
        </span>
        {du > 0 ? (
          <span className="pastille-compte">{du}</span>
        ) : (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="À jour"
               className="shrink-0 text-[var(--muted-foreground)]">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </Link>
    </li>
  );
}
