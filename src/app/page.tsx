import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SqueletteCarte } from "@/components/Squelettes";
import { FormulaireEcheance } from "@/components/Echeances";
import { PastilleMatiere, styleMatiere } from "@/components/Matiere";
import { formatCentimes, tempsRestant } from "@/lib/money";
import { formatTaille } from "@/lib/stockage";
import {
  activiteFiches, marchesBientotFermes, resumeFiches, type ActiviteFiches, type ResumeFiches,
} from "@/lib/dashboard";
import { documentsRecents } from "@/lib/documents";
import { echeancesAVenir, quand } from "@/lib/echeances";
import { heure, jourCourt, plage, prochainesColles, salle } from "@/lib/colles";
import { listerMatieres } from "@/lib/matieres";
import { rappels } from "@/lib/rappels";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";

/*
 * Accueil = tableau de bord compact.
 *
 * Haut : rappels (dans le portail uniquement), puis quatre chiffres.
 * Ensuite colles, fiches suivies, échéances, puis documents et marchés
 * côte à côte. Chaque bloc a son propre Suspense : une requête lente
 * n'empêche pas les autres de s'afficher. La couleur d'une matière est
 * la même partout, toujours accompagnée de son nom.
 */
export default async function Accueil() {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");

  const heureParis = Number(new Date().toLocaleString("fr-FR", {
    timeZone: "Europe/Paris", hour: "2-digit", hour12: false,
  }));
  const salutation = heureParis < 5 ? "Bonne nuit" : heureParis < 18 ? "Bonjour" : "Bonsoir";
  // Une seule lecture des fiches, partagée par les rappels, les chiffres
  // et la carte Fiches.
  const fiches = resumeFiches(u.id);
  const activite = activiteFiches(u.id);

  return (
    <main className="dashboard py-3">
      <header className="page-heading mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-[20px] font-bold leading-tight">
            {salutation}, {u.display_name}
          </h1>
          <p className="text-[12px] capitalize text-[var(--muted-foreground)]">
            {new Date().toLocaleDateString("fr-FR", {
              timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long",
            })}
          </p>
        </div>
        <Link href="/colles"
              className="shrink-0 rounded-full border bg-[var(--card)] px-2.5 py-1 text-[12px] font-medium
                         hover:bg-[var(--muted)]">
          {u.groupe_colle ? `Groupe ${u.groupe_colle}` : "Groupe ?"}
        </Link>
      </header>

      <div className="dashboard-grid">
        <div className="dashboard-reminders">
        <Suspense fallback={null}>
          <Rappels groupe={u.groupe_colle} fiches={fiches} />
        </Suspense>
        </div>
        <div className="dashboard-metrics">
        <Suspense fallback={<div className="skeleton h-[62px]" />}>
          <Chiffres fiches={fiches} activite={activite} />
        </Suspense>
        </div>
        <div className="dashboard-details">
        <div className="dashboard-colles">
        <Suspense fallback={<SqueletteCarte />}>
          <CarteColles groupe={u.groupe_colle} />
        </Suspense>
        </div>
        <div className="dashboard-fiches">
        <Suspense fallback={<SqueletteCarte />}>
          <CarteFiches fiches={fiches} activite={activite} />
        </Suspense>
        </div>
        <div className="dashboard-echeances">
        <Suspense fallback={<SqueletteCarte />}>
          <CarteEcheances />
        </Suspense>
        </div>
        </div>
        <div className="dashboard-documents">
          <Suspense fallback={<SqueletteCarte />}>
            <CarteDocuments />
          </Suspense>
        </div>
        <div className="dashboard-marches">
          <Suspense fallback={<SqueletteCarte />}>
            <CarteMarches userId={u.id} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

/* Enveloppe commune, resserrée : titre discret, lien à droite. */
function Bloc({
  titre, lien, lienLabel, children, className = "",
}: {
  titre: string; lien?: string; lienLabel?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`app-surface dashboard-card rounded-[var(--radius-lg)] border p-4 lg:p-6 ${className}`}>
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="text-[14px] font-semibold tracking-tight text-[var(--foreground)]">
          {titre}
        </h2>
        {lien && (
          <Link href={lien} className="text-[12px] font-medium text-[var(--primary)]">
            {lienLabel ?? "Tout voir"}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Vide({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] text-[var(--muted-foreground)]">{children}</p>;
}

/* ------------------------------------------------------------------ */

async function Rappels({ groupe, fiches }: { groupe: number | null; fiches: Promise<ResumeFiches> }) {
  const liste = await rappels(groupe, await fiches);
  if (liste.length === 0) return null;

  return (
    <section aria-label="Rappels" className="grid gap-2 lg:grid-cols-3">
      {liste.map((r) => (
        <Link
          key={r.id}
          href={r.lien}
          style={styleMatiere(r.couleur)}
          className={`m-liseret flex items-center gap-2.5 rounded-[var(--radius-md)] border py-2 pl-3.5 pr-3
                      transition-colors hover:brightness-[0.98] ${r.urgent ? "m-teinte-forte m-bord" : "m-teinte"}`}
        >
          <span aria-hidden className="m-texte shrink-0">
            <IconeRappel genre={r.genre} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold">{r.titre}</span>
            <span className="block truncate text-[11px] text-[var(--muted-foreground)]">{r.detail}</span>
          </span>
          {r.urgent && (
            <span className="shrink-0 rounded-full bg-[var(--foreground)] px-1.5 py-px text-[10px] font-bold
                             uppercase tracking-wide text-[var(--background)]">
              Bientôt
            </span>
          )}
        </Link>
      ))}
    </section>
  );
}

function IconeRappel({ genre }: { genre: "colle" | "fiches" | "echeance" }) {
  const d = genre === "colle" ? "M4 6h16v14H4zM4 10h16M8 3v4m8-4v4"
    : genre === "fiches" ? "M4 6h13v13H4zM7 3h13v13"
      : "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18";
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9"
         strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  );
}

/* ------------------------------------------------------------------ */

type Donnees = { fiches: Promise<ResumeFiches>; activite: Promise<ActiviteFiches> };

async function Chiffres({ fiches, activite }: Donnees) {
  const [r, a] = await Promise.all([fiches, activite]);
  const tuiles: Array<{ valeur: string; label: string; detail?: string }> = [
    { valeur: String(r.a_reviser + r.nouvelles), label: "à voir", detail: r.nouvelles > 0 ? `${r.nouvelles} nouv.` : undefined },
    { valeur: String(r.revises_aujourdhui), label: "aujourd’hui" },
    { valeur: `${a.serie} j`, label: "série" },
    { valeur: a.retention === null ? "—" : `${Math.round(a.retention * 100)} %`, label: "rétention 30 j" },
  ];
  return (
    <dl className="app-surface dashboard-stats grid grid-cols-4 divide-x rounded-[var(--radius-lg)] border py-4 lg:py-6">
      {tuiles.map((t) => (
        <div key={t.label} className="flex flex-col-reverse px-1 text-center">
          <dt className="truncate text-[10px] text-[var(--muted-foreground)]">
            {t.label}{t.detail && <span className="hidden min-[380px]:inline"> · {t.detail}</span>}
          </dt>
          <dd className="tabular text-[24px] font-semibold leading-tight lg:text-[36px]">{t.valeur}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------ */

async function CarteColles({ groupe }: { groupe: number | null }) {
  if (groupe === null) {
    return (
      <Bloc titre="Colles" lien="/colles" lienLabel="Choisir mon groupe">
        <Vide>Indiquez votre groupe pour voir vos prochaines colles et recevoir les rappels.</Vide>
      </Bloc>
    );
  }
  const colles = await prochainesColles(groupe, 3, 30);

  return (
    <Bloc titre={`Prochaines colles · groupe\u00a0${groupe}`} lien="/colles" lienLabel="Semaine">
      {colles.length === 0 ? (
        <Vide>Aucune colle dans les 30 prochains jours.</Vide>
      ) : (
        <ul className="grid gap-1.5 min-[420px]:grid-cols-3">
          {colles.map((c) => (
            <li key={c.id} style={styleMatiere(c.couleur)}
                className="m-teinte m-liseret rounded-[var(--radius-md)] py-1.5 pl-3 pr-2">
              <div className="flex items-baseline justify-between gap-1 min-[420px]:block">
                <p className="m-texte truncate text-[12px] font-bold">{c.matiere}</p>
                <p className="tabular text-[11px] font-medium">
                  {jourCourt(c.debut)} · {heure(c.debut)}
                </p>
              </div>
              <p className="truncate text-[11px] text-[var(--muted-foreground)]">
                {c.colleur} · {salle(c.salle)}
              </p>
              {c.alternative && (
                <p className="truncate text-[10px] text-[var(--muted-foreground)]" title={c.alternative.condition}>
                  ou {jourCourt(c.alternative.debut)} {plage(c.alternative.debut, c.alternative.fin)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Bloc>
  );
}

/* ------------------------------------------------------------------ */

async function CarteFiches({ fiches, activite }: Donnees) {
  const [r, a] = await Promise.all([fiches, activite]);

  if (r.paquets_suivis === 0) {
    return (
      <Bloc titre="Fiches" lien="/fiches" lienLabel="Choisir des paquets">
        <Vide>
          Vous ne suivez aucun paquet. Seuls les paquets suivis entrent dans vos révisions,
          vos statistiques et vos rappels.
        </Vide>
      </Bloc>
    );
  }

  const cible = r.prochain_paquet ? `/fiches/${r.prochain_paquet.slug}/reviser` : null;
  const max = Math.max(1, ...a.jours.map((j) => j.n));
  const total14 = a.jours.reduce((n, j) => n + j.n, 0);

  return (
    <Bloc titre={`Fiches suivies · ${r.paquets_suivis}`} lien="/fiches" lienLabel="Paquets">
      {/* Activité : une seule série, donc pas de légende — le titre la nomme. */}
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-[var(--muted-foreground)]">
            Révisions, 14 jours · <span className="tabular font-medium text-[var(--foreground)]">{total14}</span>
            {a.semaine > 0 && <> · {a.semaine} prévues cette semaine</>}
          </p>
          <div className="mt-1 flex h-9 items-end gap-[2px]" role="img"
               aria-label={`Révisions par jour : ${a.jours.map((j) => `${j.jour} ${j.n}`).join(", ")}`}>
            {a.jours.map((j, i) => (
              <div key={j.jour} className="group relative flex h-full flex-1 items-end"
                   title={`${new Date(`${j.jour}T12:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })} : ${j.n} révision${j.n > 1 ? "s" : ""}`}>
                <div className="w-full rounded-t-[3px] bg-[var(--primary)] group-hover:opacity-80"
                     style={{
                       height: j.n > 0 ? `${Math.max(12, (j.n / max) * 100)}%` : "2px",
                       opacity: j.n > 0 ? (i === a.jours.length - 1 ? 1 : 0.7) : 0.2,
                     }} />
              </div>
            ))}
          </div>
        </div>
        {cible ? (
          <Link href={cible}
                className="shrink-0 rounded-[var(--radius-md)] bg-[var(--primary)] px-3 py-2 text-[13px]
                           font-semibold text-[var(--primary-foreground)]">
            Réviser
          </Link>
        ) : (
          <span className="shrink-0 text-[12px] font-medium text-[var(--muted-foreground)]">À jour ✓</span>
        )}
      </div>

      <ul className="mt-2.5 space-y-1">
        {r.paquets.slice(0, 4).map((p) => {
          const du = p.apprentissage + p.a_revoir + p.nouvelles;
          const vu = p.total > 0 ? 1 - p.nouvelles / p.total : 0;
          return (
            <li key={p.id}>
              <Link href={`/fiches/${p.slug}`} style={styleMatiere(p.couleur)}
                    className="flex items-center gap-2 rounded-[var(--radius-sm)] py-0.5 hover:bg-[var(--muted)]">
                <PastilleMatiere nom={p.matiere} couleur={p.couleur} petite className="w-[92px] shrink-0" />
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{p.titre}</span>
                {/* Part des cartes déjà vues : même couleur que la matière. */}
                <span className="hidden h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-[var(--muted)] min-[400px]:block"
                      title={`${Math.round(vu * 100)} % des cartes déjà vues`}>
                  <span className="m-plein block h-full rounded-full" style={{ width: `${vu * 100}%` }} />
                </span>
                <span className={`tabular w-8 shrink-0 text-right text-[12px] ${du > 0 ? "font-bold" : "text-[var(--muted-foreground)]"}`}>
                  {du > 0 ? du : "✓"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {r.paquets.length > 4 && (
        <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
          + {r.paquets.length - 4} autre{r.paquets.length > 5 ? "s" : ""} paquet{r.paquets.length > 5 ? "s" : ""}
        </p>
      )}
    </Bloc>
  );
}

/* ------------------------------------------------------------------ */

async function CarteEcheances() {
  const [liste, matieres] = await Promise.all([echeancesAVenir(5), listerMatieres()]);

  return (
    <Bloc titre="Échéances">
      {liste.length === 0 ? (
        <Vide>Aucune échéance enregistrée.</Vide>
      ) : (
        <ul className="divide-y">
          {liste.map((e) => {
            const proche = new Date(e.due_at).getTime() - Date.now() < 3 * 86_400_000;
            return (
              <li key={e.id} style={styleMatiere(e.couleur)} className="flex items-center gap-2 py-1.5">
                <span className={`w-11 shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-bold uppercase
                                  tracking-wide ${e.couleur ? "m-teinte-forte m-texte" : "bg-[var(--muted)] text-[var(--muted-foreground)]"}`}>
                  {e.kind}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{e.titre}</p>
                  {e.matiere && <p className="m-texte truncate text-[11px] font-medium">{e.matiere}</p>}
                </div>
                <span className={`tabular shrink-0 text-[11px] ${proche ? "font-bold" : "text-[var(--muted-foreground)]"}`}>
                  {quand(e.due_at)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <FormulaireEcheance matieres={matieres.map(({ id, nom }) => ({ id, nom }))} />
    </Bloc>
  );
}

async function CarteDocuments() {
  const docs = await documentsRecents(4);

  return (
    <Bloc titre="Documents récents" lien="/documents">
      {docs.length === 0 ? (
        <Vide>Aucun document déposé pour l’instant.</Vide>
      ) : (
        <ul className="space-y-1">
          {docs.map((d) => (
            <li key={d.id}>
              <Link href={`/documents?doc=${d.id}`} style={styleMatiere(d.couleur)}
                    className="flex items-center gap-2 rounded-[var(--radius-sm)] hover:bg-[var(--muted)]">
                <span className="m-plein h-2 w-2 shrink-0 rounded-full" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[12px]">
                  {d.original_name}
                  <span className="sr-only"> — {d.matiere ?? "sans matière"}</span>
                </span>
                <span className="tabular shrink-0 text-[10px] text-[var(--muted-foreground)]">
                  {formatTaille(d.taille)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Bloc>
  );
}

async function CarteMarches({ userId }: { userId: string }) {
  const marches = await marchesBientotFermes(userId, 3);

  return (
    <Bloc titre="Marchés qui ferment" lien="/marche">
      {marches.length === 0 ? (
        <Vide>Aucun marché ouvert.</Vide>
      ) : (
        <ul className="space-y-1.5">
          {marches.map((m) => (
            <li key={m.id}>
              <Link href={`/marche/${m.slug}`} className="block rounded-[var(--radius-sm)] hover:bg-[var(--muted)]">
                <p className="truncate text-[12px] font-medium">{m.question}</p>
                <p className="tabular text-[10px] text-[var(--muted-foreground)]">
                  {tempsRestant(m.closes_at)} · {formatCentimes(m.cagnotte)}
                  {m.ma_mise > 0 && ` · vous ${formatCentimes(m.ma_mise)}`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Bloc>
  );
}
