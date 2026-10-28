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
 * Accueil : la semaine (colles et échéances) d'abord, puis une ligne
 * pour les révisions et une pour le marché qui ferme le plus tôt.
 */
export default async function Accueil() {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");

  const heureParis = Number(new Date().toLocaleString("fr-FR", {
    timeZone: "Europe/Paris", hour: "2-digit", hour12: false,
  }));
  const salutation = heureParis < 5 ? "Bonne nuit" : heureParis < 18 ? "Bonjour" : "Bonsoir";

  return (
    <main className="flex flex-col gap-10">
      <header className="flex items-center justify-between gap-4">
        <h1 className="titre-page min-w-0 [overflow-wrap:anywhere]">
          {salutation}, {u.display_name}
        </h1>
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

      <Suspense fallback={<div className="skeleton h-[220px]" />}>
        <Semaine groupe={u.groupe_colle} />
      </Suspense>

      <ul>
        <Suspense fallback={<li className="skeleton h-16" />}>
          <Revisions userId={u.id} />
        </Suspense>
        <Suspense fallback={null}>
          <MarcheProche userId={u.id} />
        </Suspense>
      </ul>
    </main>
  );
}

/* Une ligne : le nombre de cartes dues, ou Fiches quand tout est fait. */
async function Revisions({ userId }: { userId: string }) {
  const r = await resumeFiches(userId);
  const total = r.a_reviser + r.nouvelles;
  const href = total > 0 && r.prochain_paquet ? `/fiches/${r.prochain_paquet.slug}/reviser` : "/fiches";

  return (
    <li>
      <Link href={href} className="ligne">
        <span className="ligne__titre flex-1">{total > 0 ? "Réviser" : "Fiches"}</span>
        {total > 0 ? <span className="pastille-compte">{total}</span> : <Chevron />}
      </Link>
    </li>
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
    <section aria-label="Cette semaine" className="flex flex-col">
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
    <li>
      <Link href={`/marche/${m.slug}`} className="ligne">
        <span className="ligne__titre min-w-0 flex-1">{m.question}</span>
        <span className="shrink-0 text-[14px] text-[var(--muted-foreground)]">{tempsRestant(m.closes_at)}</span>
      </Link>
    </li>
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
