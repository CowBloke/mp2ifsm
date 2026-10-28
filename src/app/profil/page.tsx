import { Administration } from "@/components/Administration";
import { ProposalList } from "@/components/AdminPanel";
import { proposals } from "@/lib/proposals";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LienRetour } from "@/components/LienRetour";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BoutonRetour } from "@/components/BoutonRetour";
import { Portefeuille } from "@/components/Portefeuille";
import { ReglagePartageStats } from "@/components/ReglagesProfil";
import { SquelettePortefeuille, SqueletteListe } from "@/components/Squelettes";
import { deconnexion } from "@/lib/actions";
import { formatCentimes } from "@/lib/money";
import {
  mouvements, positionsOuvertes, positionsReglees, soldeCentimes,
} from "@/lib/queries";
import { transfertsEnAttente } from "@/lib/kcmaths";
import { utilisateurCourant } from "@/lib/session";
import { queryOne } from "@/lib/db";
import { ReglageGroupe } from "@/components/Groupe";
import { BadgeStatut } from "@/components/AdminRetours";
import { NOM_CATEGORIE } from "@/lib/constantes";
import { GROUPE_MAX } from "@/lib/colloscope";
import { mesRetours } from "@/lib/retours";

export const dynamic = "force-dynamic";

/*
 * Profil : solde, paris, réglages. Les sections vides ne s'affichent pas ;
 * le relevé détaillé reste replié.
 */
export default async function PageMoi({ searchParams }: { searchParams: Promise<{ onglet?: string }> }) {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  const adminTab = u.role === "admin" && (await searchParams).onglet === "admin";

  return (
    <main>
      <LienRetour href="/" label="Retour à l’accueil" />
      <header className="page-heading">
        <h1 className="min-w-0 [overflow-wrap:anywhere]">{u.display_name}</h1>
        {u.role === "admin" && (
          <nav aria-label="Rubriques du profil" className="flex gap-2">
            <Link href="/profil" aria-current={!adminTab ? "page" : undefined} className="puce">Profil</Link>
            <Link href="/profil?onglet=admin" aria-current={adminTab ? "page" : undefined} className="puce">Admin</Link>
          </nav>
        )}
      </header>

      {adminTab ? <Administration userId={u.id} /> : (
        <div className="page-stack">
          <Suspense fallback={<SquelettePortefeuille />}>
            <Solde userId={u.id} />
          </Suspense>

          <Suspense fallback={<SqueletteListe n={3} />}>
            <Positions userId={u.id} />
          </Suspense>

          <Suspense fallback={<SqueletteListe n={3} />}>
            <Reglages userId={u.id} groupe={u.groupe_colle} />
          </Suspense>

          <Suspense fallback={null}>
            <MesRetours userId={u.id} />
          </Suspense>

          <Suspense fallback={null}>
            <MesPropositions userId={u.id} />
          </Suspense>

          <form action={deconnexion}>
            <button type="submit" className="lien-discret text-[var(--destructive)]">Déconnexion</button>
          </form>
        </div>
      )}
    </main>
  );
}

async function Reglages({ userId, groupe }: { userId: string; groupe: number | null }) {
  const r = await queryOne<{ partage_stats: boolean }>(
    `select partage_stats from app_user where id = $1::uuid`, [userId]);

  return (
    <section aria-label="Réglages">
      <ReglageGroupe groupe={groupe} max={GROUPE_MAX} />
      <ReglagePartageStats initial={r?.partage_stats ?? false} />
      <div className="ligne">
        <span className="ligne__titre flex-1">Thème</span>
        <ThemeToggle />
      </div>
      <div className="mt-4">
        <BoutonRetour />
      </div>
    </section>
  );
}

async function MesRetours({ userId }: { userId: string }) {
  const retours = await mesRetours(userId);
  if (retours.length === 0) return null;
  return (
    <section id="mes-retours" className="scroll-mt-24">
      <h2 className="etiquette mb-2">Mes retours</h2>
      <ul>
        {retours.map((r) => (
          <li key={r.id} className="border-b py-4 last:border-b-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
              <BadgeStatut statut={r.statut} />
              <span className="font-semibold">{NOM_CATEGORIE[r.categorie]}</span>
              <span>{new Date(r.created_at).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}</span>
            </div>
            <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap break-words text-[13px]">{r.message}</p>
            {r.reponse && (
              <p className="mt-2 border-l-2 pl-2 text-[12px]">{r.reponse}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

async function MesPropositions({ userId }: { userId: string }) {
  const items = await proposals(userId);
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="etiquette mb-2">Mes propositions de paris</h2>
      <ProposalList items={JSON.parse(JSON.stringify(items))} />
    </section>
  );
}

async function Solde({ userId }: { userId: string }) {
  const [solde, enAttente] = await Promise.all([
    soldeCentimes(userId),
    transfertsEnAttente(userId),
  ]);
  return <Portefeuille solde={solde} enAttente={enAttente} />;
}

async function Positions({ userId }: { userId: string }) {
  const [ouvertes, reglees, releve] = await Promise.all([
    positionsOuvertes(userId),
    positionsReglees(userId),
    mouvements(userId, 30),
  ]);

  return (
    <>
      {ouvertes.length > 0 && (
        <section>
          <h2 className="etiquette mb-2">Paris en cours</h2>
          <ul>
            {ouvertes.map((p) => (
              <li key={p.bet_id}>
                <Link href={`/marche/${p.slug}`} className="ligne">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="ligne__titre truncate">{p.question}</span>
                    <span className="ligne__meta">{p.outcome_label}</span>
                  </span>
                  <span className="tabular shrink-0 text-[14px] font-semibold">{formatCentimes(p.amount)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {reglees.length > 0 && (
        <section>
          <h2 className="etiquette mb-2">Paris terminés</h2>
          <ul>
            {reglees.map((p) => {
              const net = (p.payout ?? 0) - p.amount;
              return (
                <li key={p.bet_id}>
                  <Link href={`/marche/${p.slug}`} className="ligne">
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="ligne__titre truncate">{p.question}</span>
                      <span className="ligne__meta">{p.outcome_label}</span>
                    </span>
                    <span className="tabular shrink-0 text-[14px] font-semibold"
                          style={{ color: net >= 0 ? "var(--outcome-1)" : "var(--outcome-2)" }}>
                      {net >= 0 ? "+" : ""}{formatCentimes(net)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {releve.length > 0 && (
        <details>
          <summary className="etiquette min-h-11 cursor-pointer py-3">Relevé du compte</summary>
          <ul className="divide-y">
            {releve.map((m) => (
              <li key={`${m.id}-${m.kind}`} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{m.question ?? LIBELLES[m.kind] ?? m.kind}</p>
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    {new Date(m.created_at).toLocaleDateString("fr-FR", {
                      timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                </div>
                <span className="tabular shrink-0 text-[13px] font-semibold"
                      style={{ color: m.amount >= 0 ? "var(--outcome-1)" : "var(--foreground)" }}>
                  {m.amount >= 0 ? "+" : ""}{formatCentimes(m.amount)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

const LIBELLES: Record<string, string> = {
  deposit: "Dépôt",
  withdrawal: "Retrait",
  bet: "Mise",
  payout: "Gain",
  refund: "Remboursement",
};
