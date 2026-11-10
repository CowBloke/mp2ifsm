import Link from "next/link";
import { redirect } from "next/navigation";
import { Cadre } from "@/components/courbes/Cadre";
import { Formule } from "@/components/courbes/Formule";
import { lireClassements, type LigneTir } from "@/lib/courbes/classement";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Classement de Curve Fight — MP2I/FSM" };

const BASE = "/divertissement/curve-fight";
const ONGLETS = [
  { cle: "joueurs", nom: "Joueurs" },
  { cle: "tirs", nom: "Plus beaux tirs" },
  { cle: "fonctions", nom: "Fonctions fétiches" },
] as const;
type Onglet = (typeof ONGLETS)[number]["cle"];

const MEDAILLES = ["#ffd23f", "#cfd8e6", "#e09a5b"];
const jour = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });

/*
 * Classements de Curve Fight. Seules les parties entre humains comptent :
 * les éliminations de bots et par des bots ne sont jamais enregistrées.
 */
export default async function PageClassement({ searchParams }: { searchParams: Promise<{ onglet?: string }> }) {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  const demande = (await searchParams).onglet;
  const onglet: Onglet = ONGLETS.some((o) => o.cle === demande) ? demande as Onglet : "joueurs";
  const c = await lireClassements();

  return (
    <Cadre retour={{ href: BASE, libelle: "Salons" }}>
      <header className="mb-5">
        <h1 className="cf-logo text-[40px] sm:text-[56px]">Classement</h1>
        <p className="mt-2 text-[13px] text-white/55">Parties entre membres uniquement : les bots ne rapportent rien.</p>
      </header>

      <nav aria-label="Classements" className="mb-4 flex flex-wrap gap-2">
        {ONGLETS.map((o) => (
          <Link key={o.cle} href={`${BASE}/classement?onglet=${o.cle}`} scroll={false}
                aria-current={o.cle === onglet ? "page" : undefined}
                className={`cf-pastille ${o.cle === onglet ? "!border-[var(--cf-cyan)] !bg-[rgba(79,216,255,0.14)] !text-[var(--cf-cyan)]" : ""}`}>
            {o.nom}
          </Link>
        ))}
      </nav>

      {onglet === "joueurs" && (
        <section className="cf-carte">
          {c.joueurs.length === 0 ? <Vide /> : (
            <ol className="flex flex-col">
              <li className="grid grid-cols-[28px_minmax(0,1fr)_repeat(3,56px)] gap-2 px-2 pb-2 text-[11px] font-bold uppercase tracking-wider text-white/45">
                <span /><span>Joueur</span><span className="text-right">Victoires</span>
                <span className="text-right">Élim.</span><span className="text-right">Parties</span>
              </li>
              {c.joueurs.map((j, i) => (
                <li key={j.id} className={`grid grid-cols-[28px_minmax(0,1fr)_repeat(3,56px)] items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2.5
                                            ${j.id === u.id ? "bg-[rgba(79,216,255,0.1)]" : i % 2 ? "" : "bg-white/[0.03]"}`}>
                  <span className="font-mono text-[14px] font-bold" style={{ color: MEDAILLES[i] ?? "rgba(255,255,255,0.45)" }}>{i + 1}</span>
                  <span className="truncate text-[15px] font-semibold">{j.nom}</span>
                  <span className="text-right font-mono text-[15px] font-bold text-[var(--cf-or)]">{j.victoires}</span>
                  <span className="text-right font-mono text-[14px]">{j.eliminations}</span>
                  <span className="text-right font-mono text-[14px] text-white/55">{j.parties}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {onglet === "tirs" && (
        <div className="flex flex-col gap-4">
          <section className="cf-carte">
            <p className="cf-titre-carte">Les tirs les plus meurtriers</p>
            {c.tirs.length === 0 ? <Vide /> : <ListeTirs tirs={c.tirs} />}
          </section>
          {c.lointains.length > 0 && (
            <section className="cf-carte">
              <p className="cf-titre-carte">Les tirs les plus lointains</p>
              <ListeTirs tirs={c.lointains} distance />
            </section>
          )}
        </div>
      )}

      {onglet === "fonctions" && (
        <section className="cf-carte">
          <p className="cf-titre-carte">Les expressions qui ont fait le plus de victimes</p>
          {c.fetiches.length === 0 ? <Vide /> : (
            <ol className="flex flex-col gap-2">
              {c.fetiches.map((f, i) => (
                <li key={`${f.tir}:${f.expression}`} className="flex items-center gap-3 rounded-[var(--radius-sm)] bg-white/[0.03] px-3 py-2.5">
                  <span className="w-6 font-mono text-[14px] font-bold" style={{ color: MEDAILLES[i] ?? "rgba(255,255,255,0.45)" }}>{i + 1}</span>
                  <span className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-[17px]">
                    <Formule source={f.expression} equadiff={f.tir === "equadiff"} />
                  </span>
                  <span className="shrink-0 text-right text-[12px] text-white/55">
                    <strong className="block font-mono text-[15px] text-[var(--cf-or)]">{f.victimes} élim.</strong>
                    {f.tirs} tir{f.tirs > 1 ? "s" : ""} · {f.auteurs} auteur{f.auteurs > 1 ? "s" : ""}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </Cadre>
  );
}

function Vide() {
  return <p className="py-6 text-center text-[14px] text-white/50">Rien encore : la première partie entre membres ouvrira le classement.</p>;
}

function ListeTirs({ tirs, distance }: { tirs: LigneTir[]; distance?: boolean }) {
  return (
    <ol className="flex flex-col gap-2">
      {tirs.map((t, i) => (
        <li key={t.id} className="flex items-center gap-3 rounded-[var(--radius-sm)] bg-white/[0.03] px-3 py-2.5">
          <span className="w-6 font-mono text-[14px] font-bold" style={{ color: MEDAILLES[i] ?? "rgba(255,255,255,0.45)" }}>{i + 1}</span>
          <span className="min-w-0 flex-1">
            <span className="block overflow-x-auto whitespace-nowrap text-[17px]">
              <Formule source={t.expression} equadiff={t.tir === "equadiff"} />
            </span>
            <span className="mt-0.5 block text-[12px] text-white/50">
              {t.nom} · {jour.format(t.cree_le)}{t.mode === "brouillard" ? " · dans le brouillard" : ""}
            </span>
          </span>
          <span className="shrink-0 text-right font-mono text-[15px] font-bold text-[var(--cf-or)]">
            {distance ? `${t.longueur.toFixed(1)} u` : `${t.victimes} élim.`}
            {!distance && <span className="block text-[11px] font-normal text-white/45">{t.longueur.toFixed(1)} u</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
