import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FormulaireEcheance } from "@/components/Echeances";
import { tempsRestant } from "@/lib/money";
import { marchesBientotFermes, resumeFiches } from "@/lib/dashboard";
import { echeancesAVenir } from "@/lib/echeances";
import { deMatiere, jourRelatif, prochainesColles } from "@/lib/colles";
import { listerMatieres } from "@/lib/matieres";
import { utilisateurCourant } from "@/lib/session";
import { jeuOuvertPour } from "./jeu/acces";

export const dynamic = "force-dynamic";

/*
 * Accueil épuré : une seule action principale (réviser), la semaine à
 * venir en quelques lignes, et le marché qui ferme le plus tôt.
 */
export default async function Accueil() {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");

  const heureParis = Number(new Date().toLocaleString("fr-FR", {
    timeZone: "Europe/Paris", hour: "2-digit", hour12: false,
  }));
  const salutation = heureParis < 5 ? "Bonne nuit" : heureParis < 18 ? "Bonjour" : "Bonsoir";
  const date = new Date().toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long",
  });

  return (
    <main className="flex flex-col gap-12">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[14px] text-[var(--muted-foreground)]">{date}</p>
          <h1 className="titre-page mt-1.5 [overflow-wrap:anywhere]">
            {salutation}, {u.display_name}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {jeuOuvertPour(u) ? (
            <Link href="/jeu" aria-label="Taupe Fighter, le jeu de la classe" className="bouton-rond">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor"
                   strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 6h10a4 4 0 0 1 4 4v4.5a2.5 2.5 0 0 1-4.6 1.4L15 14H9l-1.4 1.9A2.5 2.5 0 0 1 3 14.5V10a4 4 0 0 1 4-4zM7.5 9v3M6 10.5h3M15.5 10h.01M17.5 12h.01" />
              </svg>
            </Link>
          ) : null}
          <Link href="/profil" aria-label="Profil"
                className="grid h-11 w-11 place-items-center rounded-full bg-[var(--secondary)]
                           text-[16px] font-semibold text-[var(--secondary-foreground)]">
            {u.display_name.trim().charAt(0).toLocaleUpperCase("fr") || "?"}
          </Link>
        </div>
      </header>

      <Suspense fallback={<div className="skeleton h-[200px]" />}>
        <Revisions userId={u.id} />
      </Suspense>

      <Suspense fallback={<div className="skeleton h-[220px]" />}>
        <Semaine groupe={u.groupe_colle} />
      </Suspense>

      <Suspense fallback={null}>
        <MarcheProche userId={u.id} />
      </Suspense>
    </main>
  );
}

async function Revisions({ userId }: { userId: string }) {
  const r = await resumeFiches(userId);
  const total = r.a_reviser + r.nouvelles;
  const autres = r.paquets.filter((p) => p.apprentissage + p.a_revoir + p.nouvelles > 0).length - 1;

  if (r.paquets_suivis === 0) {
    return (
      <section aria-labelledby="rev" className="flex flex-col gap-5">
        <div>
          <h2 id="rev" className="etiquette">À réviser aujourd’hui</h2>
          <p className="mt-1 text-[17px]">Vous ne suivez encore aucun paquet.</p>
        </div>
        <Link href="/fiches" className="bouton-principal">Choisir des paquets</Link>
      </section>
    );
  }

  return (
    <section aria-labelledby="rev" className="flex flex-col gap-5">
      <div>
        <h2 id="rev" className="etiquette">À réviser aujourd’hui</h2>
        <p className="mt-1 flex items-baseline gap-2.5">
          <span className="text-[72px] font-semibold leading-none tracking-[-0.04em]">{total}</span>
          <span className="text-[17px] text-[var(--muted-foreground)]">carte{total > 1 ? "s" : ""}</span>
        </p>
        {total === 0 ? (
          <p className="mt-2 text-[15px] text-[var(--muted-foreground)]">
            {r.revises_aujourdhui > 0 ? `${r.revises_aujourdhui} déjà faites aujourd’hui. À demain.` : "Tout est à jour."}
          </p>
        ) : r.prochain_paquet ? (
          <p className="mt-2 text-[15px]">
            {r.prochain_paquet.titre}
            {autres > 0 && (
              <span className="text-[var(--muted-foreground)]">
                {" "}· et {autres} autre{autres > 1 ? "s" : ""} paquet{autres > 1 ? "s" : ""}
              </span>
            )}
          </p>
        ) : null}
      </div>
      {total > 0 && (
        <Link href={r.prochain_paquet ? `/fiches/${r.prochain_paquet.slug}/reviser` : "/fiches"}
              className="bouton-principal">
          Commencer
        </Link>
      )}
    </section>
  );
}

/* Colles du groupe et échéances de la classe, sur sept jours, en une liste. */
async function Semaine({ groupe }: { groupe: number | null }) {
  const horizon = Date.now() + 7 * 86_400_000;
  const [colles, echeances, matieres] = await Promise.all([
    groupe === null ? Promise.resolve([]) : prochainesColles(groupe, 8, 7),
    echeancesAVenir(12),
    listerMatieres(),
  ]);

  const lignes = [
    ...colles.map((c) => ({ cle: `c${c.id}`, titre: `Colle ${deMatiere(c.matiere)}`, quand: c.debut })),
    ...echeances
      .filter((e) => new Date(e.due_at).getTime() <= horizon)
      .map((e) => ({
        cle: `e${e.id}`,
        titre: e.matiere ? `${e.titre} · ${e.matiere}` : e.titre,
        quand: e.due_at,
      })),
  ].sort((a, b) => Date.parse(a.quand) - Date.parse(b.quand)).slice(0, 6);

  return (
    <section aria-labelledby="sem" className="flex flex-col">
      <h2 id="sem" className="etiquette mb-2">Cette semaine</h2>
      {groupe === null && (
        <Link href="/colles" className="ligne">
          <span className="ligne__titre flex-1">Indiquer mon groupe de colle</span>
          <Chevron />
        </Link>
      )}
      {lignes.length === 0 ? (
        <p className="py-3 text-[15px] text-[var(--muted-foreground)]">Rien de prévu.</p>
      ) : (
        <ul>
          {lignes.map((l, i) => (
            <li key={l.cle} className="flex items-baseline justify-between gap-3 border-b py-3 last:border-b-0">
              <span className="min-w-0 text-[16px] [overflow-wrap:anywhere]">{l.titre}</span>
              <span className={`shrink-0 text-[14px] ${i === 0
                ? "font-medium text-[var(--primary)]" : "text-[var(--muted-foreground)]"}`}>
                {jourRelatif(l.quand)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <FormulaireEcheance matieres={matieres.map(({ id, nom }) => ({ id, nom }))} />
    </section>
  );
}

async function MarcheProche({ userId }: { userId: string }) {
  const [m] = await marchesBientotFermes(userId, 1);
  if (!m) return null;

  return (
    <Link href={`/marche/${m.slug}`}
          className="flex items-center gap-4 rounded-[var(--radius-lg)] bg-[var(--muted)] px-[18px] py-4
                     hover:bg-[var(--accent)]">
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[13px] text-[var(--muted-foreground)]">Ferme dans {tempsRestant(m.closes_at)}</span>
        <span className="text-[15px] font-medium leading-snug">{m.question}</span>
      </span>
      <Chevron />
    </Link>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
