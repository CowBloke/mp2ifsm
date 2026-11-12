import Link from "next/link";
import { redirect } from "next/navigation";
import { LienRetour } from "@/components/LienRetour";
import { Formule } from "@/components/courbes/Formule";
import { lireClassements, type LigneTir } from "@/lib/courbes/classement";
import { utilisateurCourant } from "@/lib/session";
import { EnTeteJeu } from "@/components/divertissement/EnTeteJeu";
import { styleJeu } from "@/components/divertissement/jeux";

export const dynamic = "force-dynamic";
export const metadata = { title: "Classement de Curve Fight — MP2I/FSM" };

const BASE = "/divertissement/curve-fight";
const ONGLETS = [
  { cle: "joueurs", nom: "Joueurs" },
  { cle: "tirs", nom: "Plus beaux tirs" },
  { cle: "fonctions", nom: "Fonctions fétiches" },
] as const;
type Onglet = (typeof ONGLETS)[number]["cle"];

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
    <main className="jeu" style={styleJeu("courbes")}>
      <EnTeteJeu jeu="courbes" titre="Classement" retour={{ href: BASE, label: "Retour à Curve Fight" }}>
        Parties entre membres uniquement : les bots ne rapportent rien.
      </EnTeteJeu>

      <nav aria-label="Classements" className="page-toolbar mb-6">
        {ONGLETS.map((o) => (
          <Link key={o.cle} href={`${BASE}/classement?onglet=${o.cle}`} scroll={false}
                aria-current={o.cle === onglet ? "page" : undefined} className="puce">
            {o.nom}
          </Link>
        ))}
      </nav>

      {onglet === "joueurs" && (c.joueurs.length === 0 ? <Vide /> : (
        <table className="cf-table">
          <thead>
            <tr><th scope="col" className="w-8" /><th scope="col">Joueur</th><th scope="col">Victoires</th><th scope="col">Élim.</th><th scope="col">Parties</th></tr>
          </thead>
          <tbody>
            {c.joueurs.map((j, i) => (
              <tr key={j.id} aria-current={j.id === u.id ? "true" : undefined}>
                <td className="text-[var(--muted-foreground)]">{i + 1}</td>
                <td className="max-w-0 truncate text-[16px] font-medium">{j.nom}</td>
                <td className="font-semibold">{j.victoires}</td>
                <td>{j.eliminations}</td>
                <td className="text-[var(--muted-foreground)]">{j.parties}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}

      {onglet === "tirs" && (
        <div className="page-stack">
          <section>
            <h2 className="etiquette">Les tirs les plus meurtriers</h2>
            {c.tirs.length === 0 ? <Vide /> : <ListeTirs tirs={c.tirs} />}
          </section>
          {c.lointains.length > 0 && (
            <section>
              <h2 className="etiquette">Les tirs les plus lointains</h2>
              <ListeTirs tirs={c.lointains} distance />
            </section>
          )}
        </div>
      )}

      {onglet === "fonctions" && (
        <section>
          <h2 className="etiquette">Les expressions qui ont fait le plus de victimes</h2>
          {c.fetiches.length === 0 ? <Vide /> : (
            <ol>
              {c.fetiches.map((f, i) => (
                <li key={`${f.tir}:${f.expression}`} className="ligne">
                  <span className="w-5 text-[14px] text-[var(--muted-foreground)]">{i + 1}</span>
                  <span className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-[17px]">
                    <Formule source={f.expression} equadiff={f.tir === "equadiff"} />
                  </span>
                  <span className="shrink-0 text-right">
                    <strong className="block text-[15px] font-semibold">{f.victimes} élim.</strong>
                    <span className="ligne__meta">{f.tirs} tir{f.tirs > 1 ? "s" : ""} · {f.auteurs} auteur{f.auteurs > 1 ? "s" : ""}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </main>
  );
}

function Vide() {
  return <p className="py-3 text-[15px] text-[var(--muted-foreground)]">Rien encore : la première partie entre membres ouvrira le classement.</p>;
}

function ListeTirs({ tirs, distance }: { tirs: LigneTir[]; distance?: boolean }) {
  return (
    <ol>
      {tirs.map((t, i) => (
        <li key={t.id} className="ligne">
          <span className="w-5 text-[14px] text-[var(--muted-foreground)]">{i + 1}</span>
          <span className="min-w-0 flex-1">
            <span className="block overflow-x-auto whitespace-nowrap text-[17px]">
              <Formule source={t.expression} equadiff={t.tir === "equadiff"} />
            </span>
            <span className="block ligne__meta">
              {t.nom} · {jour.format(t.cree_le)}{t.mode === "brouillard" ? " · dans le brouillard" : ""}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <strong className="block text-[15px] font-semibold">{distance ? `${t.longueur.toFixed(1)} u` : `${t.victimes} élim.`}</strong>
            {!distance && <span className="ligne__meta">{t.longueur.toFixed(1)} u</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
