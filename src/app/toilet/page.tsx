import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LienRetour } from "@/components/LienRetour";
import { BoutonPassage } from "@/components/toilet/BoutonPassage";
import { PartagerLien, SupprimerPassage } from "@/components/toilet/Outils";
import { AjouterPhoto } from "@/components/toilet/AjouterPhoto";
import { utilisateurCourant } from "@/lib/session";
import {
  aProuver, classementToilet, codeInvitation, derniersPassages, ilYa, mesStats, toiletVisible,
} from "@/lib/toilet";
import {
  PERIODES, lirePeriode, passages, prochainStatut, statutPour, type Periode,
} from "@/lib/toilet-statuts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Toilet! — MP2I/FSM" };

/*
 * Toilet! (« toilet factorielle ») : classement des passages aux
 * toilettes du bas. Rubrique cachée : 404 tant que le lien secret n'a
 * pas été ouvert depuis le compte.
 */
export default async function PageToilet({ searchParams }: {
  searchParams: Promise<{ periode?: string }>;
}) {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  if (!(await toiletVisible(u.id))) notFound();

  const periode = lirePeriode((await searchParams).periode);
  const [stats, lignes, fil, code, sansPhoto] = await Promise.all([
    mesStats(u.id), classementToilet(periode), derniersPassages(), codeInvitation(), aProuver(u.id),
  ]);
  const statut = statutPour(stats.total);
  const prochain = prochainStatut(stats.total);
  const progression = prochain ? (stats.total - statut.seuil) / (prochain.seuil - statut.seuil) : 1;

  return (
    <main className="reading-column">
      <LienRetour href="/divertissement" label="Retour au divertissement" />
      <header className="page-heading mb-6">
        <h1>Toilet!</h1>
        <p>Le classement officiel des toilettes du bas. Laissez-les comme vous aimeriez les trouver.</p>
      </header>

      <section aria-label="Mon statut"
               className="mb-4 rounded-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--card)] p-4">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[var(--radius-md)]
                           bg-[var(--secondary)] text-[28px]" aria-hidden="true">{statut.emoji}</span>
          <div className="min-w-0 flex-1">
            <p className="etiquette">Mon statut</p>
            <p className="text-[18px] font-semibold leading-tight">{statut.titre}</p>
            <p className="mt-0.5 text-[13px] italic text-[var(--muted-foreground)]">{statut.devise}</p>
          </div>
        </div>
        <div className="mt-4 flex items-baseline justify-between text-[13px] text-[var(--muted-foreground)]">
          <span className="tabular">
            <strong className="text-[var(--foreground)]">{stats.total}</strong> au total
            {stats.aujourdhui > 0 && ` · ${stats.aujourdhui} aujourd’hui`}
          </span>
          {stats.dernier && <span>Dernier : {ilYa(stats.dernier)}</span>}
        </div>
        <div className="barre mt-2" role="progressbar" aria-valuemin={0} aria-valuemax={100}
             aria-valuenow={Math.round(progression * 100)} aria-label="Progression vers le prochain statut">
          <span style={{ width: `${Math.max(4, progression * 100)}%` }} />
        </div>
        <p className="mt-2 text-[13px] text-[var(--muted-foreground)]">
          {prochain
            ? <>Encore {passages(prochain.restant)} pour devenir <strong>{prochain.emoji} {prochain.titre}</strong>.</>
            : "Sommet atteint. Il n’y a plus rien au-dessus de vous, à part le réservoir."}
        </p>
      </section>

      <BoutonPassage />

      {sansPhoto.length > 0 && (
        <section aria-labelledby="titre-a-prouver" className="mt-8">
          <h2 id="titre-a-prouver" className="text-[20px] font-semibold">À prouver</h2>
          <p className="mb-2 mt-1 text-[13px] text-[var(--muted-foreground)]">
            Vos passages sans photo : ajoutez la preuve depuis votre pellicule une fois le wifi retrouvé.
          </p>
          <ul>
            {sansPhoto.map(p => (
              <li key={p.id} className="ligne">
                <span className="ligne__titre flex-1">{ilYa(p.cree_le)}</span>
                <AjouterPhoto passageId={p.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="titre-classement" className="mt-10">
        <h2 id="titre-classement" className="mb-3 text-[20px] font-semibold">Classement</h2>
        <nav aria-label="Période" className="page-toolbar mb-3">
          {(Object.keys(PERIODES) as Periode[]).map(p => (
            <Link key={p} href={p === "semaine" ? "/toilet" : `/toilet?periode=${p}`} replace scroll={false}
                  className="puce" aria-current={p === periode ? "page" : undefined}>
              {PERIODES[p]}
            </Link>
          ))}
        </nav>

        <ol className="divide-y divide-[var(--hairline)] overflow-hidden rounded-[var(--radius-lg)] border
                       border-[var(--hairline)] bg-[var(--card)]">
          {lignes.map((l, i) => {
            const moi = l.user_id === u.id;
            const s = statutPour(l.total);
            const podium = l.n > 0 && i < 3;
            return (
              <li key={l.user_id} className={`flex items-center gap-3 p-4 ${moi ? "bg-[var(--secondary)]/40" : ""}`}>
                <span className={`tabular grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-bold ${
                  podium ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                         : "bg-[var(--muted)] text-[var(--muted-foreground)]"}`}>
                  {podium ? ["🥇", "🥈", "🥉"][i] : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium">
                    {l.display_name}
                    {moi && <span className="ml-1.5 text-[11px] text-[var(--muted-foreground)]">vous</span>}
                  </p>
                  <p className="truncate text-[12px] text-[var(--muted-foreground)]">
                    {s.emoji} {s.titre}
                    {l.photos > 0 && ` · 📸 ${l.photos} preuve${l.photos > 1 ? "s" : ""}`}
                  </p>
                </div>
                <span className="tabular shrink-0 text-[17px] font-bold">{l.n}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="titre-fil" className="mt-10">
        <h2 id="titre-fil" className="mb-3 text-[20px] font-semibold">Derniers passages</h2>
        {fil.length === 0 ? (
          <p className="text-[15px] text-[var(--muted-foreground)]">
            Personne n’est encore passé. Le trône vous attend.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {fil.map(p => (
              <li key={p.id} className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--card)]">
                {p.photo && (
                  <a href={`/api/toilet/photo/${p.id}`} target="_blank" rel="noopener">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/toilet/photo/${p.id}`} alt={`Preuve de propreté de ${p.display_name}`}
                         loading="lazy" className="max-h-80 w-full bg-[var(--muted)] object-cover" />
                  </a>
                )}
                <div className="flex items-center gap-3 px-4 py-3">
                  <p className="min-w-0 flex-1 text-[14px]">
                    <span className="font-medium">{p.display_name}</span>
                    <span className="text-[var(--muted-foreground)]">
                      {p.photo ? " · propreté prouvée ✅" : " · sans preuve 🤔"}
                    </span>
                    <span className="block text-[12px] text-[var(--muted-foreground)]">{ilYa(p.cree_le)}</span>
                  </p>
                  {(p.user_id === u.id || u.role === "admin") && <SupprimerPassage id={p.id} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {code && (
        <footer className="mt-10 border-t border-[var(--hairline)] pt-4">
          <PartagerLien chemin={`/toilet/rejoindre/${code}`} />
          <p className="text-[12px] text-[var(--muted-foreground)]">
            La rubrique reste invisible pour qui n’a pas ouvert ce lien.
          </p>
        </footer>
      )}
    </main>
  );
}
