import Link from "next/link";
import { redirect } from "next/navigation";
import { PastilleMatiere, styleMatiere } from "@/components/Matiere";
import { ReglageGroupe } from "@/components/Groupe";
import {
  GROUPE_MAX, ajouterJours, groupeValide, jourParis, lundiDe,
} from "@/lib/colloscope";
import {
  heure, jourCourt, plage, prochainesColles, salle, semaineColles, type ColleVue,
} from "@/lib/colles";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";

const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

export default async function PageColles({
  searchParams,
}: {
  searchParams: Promise<{ semaine?: string; groupe?: string }>;
}) {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  const p = await searchParams;

  const demande = Number(p.groupe);
  const groupe = groupeValide(demande) ? demande : u.groupe_colle;
  const autreGroupe = groupe !== null && groupe !== u.groupe_colle;

  if (groupe === null) {
    return (
      <main className="py-4">
        <h1 className="text-[22px] font-bold leading-tight">Colles</h1>
        <p className="mb-4 mt-1 text-[13px] text-[var(--muted-foreground)]">
          Indiquez votre groupe de colles pour voir votre semaine et recevoir les
          rappels dans le portail.
        </p>
        <ReglageGroupe groupe={null} max={GROUPE_MAX} />
      </main>
    );
  }

  const aujourdhui = jourParis(new Date());
  const lundiCourant = lundiDe(aujourdhui);
  const lundi = /^\d{4}-\d{2}-\d{2}$/.test(p.semaine ?? "") ? lundiDe(p.semaine!) : lundiCourant;
  const [semaine, aVenir] = await Promise.all([
    semaineColles(groupe, lundi),
    prochainesColles(groupe, 6, 120),
  ]);

  const lien = (l: string) =>
    `/colles?semaine=${l}${autreGroupe ? `&groupe=${groupe}` : ""}`;
  const dimanche = ajouterJours(lundi, 6);
  const titreSemaine = `${fmtJour(lundi, { day: "numeric", month: "short" })} – ${fmtJour(dimanche, { day: "numeric", month: "short", year: "numeric" })}`;
  const prochaineSemaine = aVenir.find((c) => lundiDe(jourParis(new Date(c.debut))) > lundi);

  return (
    <main className="py-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold leading-tight">Colles</h1>
          <p className="text-[13px] text-[var(--muted-foreground)]">
            Groupe {groupe}
            {autreGroupe && " (consultation)"}
            {semaine.periode && ` · ${semaine.periode.libelle} ${semaine.periode.anneeScolaire}`}
          </p>
        </div>
        <form action="/colles" className="flex items-center gap-1.5">
          <input type="hidden" name="semaine" value={lundi} />
          <label className="sr-only" htmlFor="groupe-vue">Voir le groupe</label>
          <select id="groupe-vue" name="groupe" defaultValue={groupe}
                  className="rounded-[var(--radius-md)] border px-2 py-1.5 text-[13px]">
            {Array.from({ length: GROUPE_MAX }, (_, i) => i + 1).map((g) => (
              <option key={g} value={g}>Groupe {g}{g === u.groupe_colle ? " (moi)" : ""}</option>
            ))}
          </select>
          <button type="submit" className="rounded-[var(--radius-md)] border px-2.5 py-1.5 text-[13px]
                                           font-medium hover:bg-[var(--muted)]">
            Voir
          </button>
        </form>
      </header>

      {/* Navigation de semaine */}
      <nav aria-label="Semaine" className="mt-4 flex items-center justify-between gap-2
                                           rounded-[var(--radius-lg)] border bg-[var(--card)] p-1.5">
        <Link href={lien(ajouterJours(lundi, -7))} aria-label="Semaine précédente"
              className="rounded-[var(--radius-md)] px-3 py-1.5 text-[16px] hover:bg-[var(--muted)]">‹</Link>
        <div className="text-center">
          <p className="text-[14px] font-semibold">{titreSemaine}</p>
          <p className="text-[11px] text-[var(--muted-foreground)]">
            {semaine.numero ? `Colle n°\u00a0${semaine.numero} · rotation ${semaine.rotation}` : "Aucune colle prévue"}
            {lundi !== lundiCourant && (
              <> · <Link href={lien(lundiCourant)} className="font-medium text-[var(--primary)]">cette semaine</Link></>
            )}
          </p>
        </div>
        <Link href={lien(ajouterJours(lundi, 7))} aria-label="Semaine suivante"
              className="rounded-[var(--radius-md)] px-3 py-1.5 text-[16px] hover:bg-[var(--muted)]">›</Link>
      </nav>

      {semaine.notes.length > 0 && (
        <ul className="mt-3 space-y-1">
          {semaine.notes.map((n) => (
            <li key={n} className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2 text-[12px]">{n}</li>
          ))}
        </ul>
      )}

      {/* Calendrier de la semaine : une ligne par jour ouvré. */}
      <ol className="mt-3 divide-y rounded-[var(--radius-lg)] border bg-[var(--card)]">
        {JOURS.map((nom, i) => {
          const jour = ajouterJours(lundi, i);
          const colles = semaine.colles.filter((c) => jourParis(new Date(c.debut)) === jour);
          const replis = semaine.colles.filter(
            (c) => c.alternative && jourParis(new Date(c.alternative.debut)) === jour,
          );
          const estAujourdhui = jour === aujourdhui;
          if (i === 5 && colles.length === 0 && replis.length === 0) return null; // samedi vide
          return (
            <li key={jour} className="flex gap-3 px-3 py-2.5">
              <div className={`w-11 shrink-0 text-center ${estAujourdhui ? "text-[var(--primary)]" : ""}`}>
                <p className="text-[10px] font-semibold uppercase tracking-wide">{nom.slice(0, 3)}</p>
                <p className={`tabular text-[18px] font-bold leading-tight ${estAujourdhui ? "" : "text-[var(--foreground)]"}`}>
                  {Number(jour.slice(8))}
                </p>
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                {colles.length === 0 && replis.length === 0 && (
                  <p className="pt-2 text-[12px] text-[var(--muted-foreground)]">—</p>
                )}
                {colles.map((c) => <CarteColle key={c.id} c={c} />)}
                {replis.map((c) => <CarteRepli key={`${c.id}-repli`} c={c} />)}
              </div>
            </li>
          );
        })}
      </ol>

      {semaine.colles.length === 0 && prochaineSemaine && (
        <Link href={lien(lundiDe(jourParis(new Date(prochaineSemaine.debut))))}
              className="mt-3 block text-center text-[13px] font-medium text-[var(--primary)]">
          Prochaine colle{"\u00a0"}: {jourCourt(prochaineSemaine.debut)} →
        </Link>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          À venir
        </h2>
        {aVenir.length === 0 ? (
          <p className="rounded-[var(--radius-md)] border border-dashed p-4 text-center text-[13px]
                        text-[var(--muted-foreground)]">
            Aucune colle prévue dans le colloscope actuel.
          </p>
        ) : (
          <ul className="divide-y rounded-[var(--radius-lg)] border bg-[var(--card)]">
            {aVenir.map((c) => (
              <li key={c.id} style={styleMatiere(c.couleur)} className="m-liseret flex items-center gap-3 py-2 pl-3.5 pr-3">
                <span className="tabular w-20 shrink-0 text-[12px] font-medium">{jourCourt(c.debut)}</span>
                <span className="m-texte min-w-0 flex-1 truncate text-[13px] font-semibold">{c.matiere}</span>
                <span className="tabular shrink-0 text-[12px] text-[var(--muted-foreground)]">
                  {heure(c.debut)} · {salle(c.salle)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {semaine.periode && semaine.periode.notes.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Consignes du colloscope
          </h2>
          <ul className="space-y-2 text-[12px] leading-snug text-[var(--muted-foreground)]">
            {semaine.periode.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </section>
      )}

      {!autreGroupe && (
        <section className="mt-6">
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Mon groupe
          </h2>
          <ReglageGroupe groupe={u.groupe_colle} max={GROUPE_MAX} />
        </section>
      )}
    </main>
  );
}

function fmtJour(jour: string, options: Intl.DateTimeFormatOptions) {
  return new Date(`${jour}T12:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", ...options });
}

function CarteColle({ c }: { c: ColleVue }) {
  return (
    <article style={styleMatiere(c.couleur)}
             className="m-teinte m-liseret rounded-[var(--radius-md)] py-2 pl-3.5 pr-3">
      <div className="flex items-center justify-between gap-2">
        <PastilleMatiere nom={c.matiere} couleur={c.couleur} petite />
        <span className="tabular text-[13px] font-bold">{plage(c.debut, c.fin)}</span>
      </div>
      <p className="mt-1 text-[13px] font-medium">{c.colleur}</p>
      <p className="tabular text-[11px] text-[var(--muted-foreground)]">
        Salle {salle(c.salle)} · groupe{"\u00a0"}{c.groupe} · {c.creneau}
      </p>
      {c.alternative && (
        <p className="mt-1 text-[11px]">
          Ou {jourCourt(c.alternative.debut)}, {plage(c.alternative.debut, c.alternative.fin)},
          salle {salle(c.alternative.salle)}, {c.alternative.condition}.
        </p>
      )}
      {c.notes.map((n) => (
        <p key={n} className="mt-1 text-[11px] italic text-[var(--muted-foreground)]">{n}</p>
      ))}
    </article>
  );
}

/** Créneau de repli (P2 le vendredi) : affiché en pointillés, pour mémoire. */
function CarteRepli({ c }: { c: ColleVue }) {
  const a = c.alternative!;
  return (
    <article style={styleMatiere(c.couleur)}
             className="m-bord rounded-[var(--radius-md)] border border-dashed px-3 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <PastilleMatiere nom={c.matiere} couleur={c.couleur} petite />
        <span className="tabular text-[12px] font-semibold">{plage(a.debut, a.fin)}</span>
      </div>
      <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
        Créneau de repli · {c.colleur} · salle {salle(a.salle)}, {a.condition}
      </p>
    </article>
  );
}
