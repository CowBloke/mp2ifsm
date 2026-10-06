import Link from "next/link";
import { redirect } from "next/navigation";
import { PastilleMatiere } from "@/components/Matiere";
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
      <main>
        <header className="page-heading">
          <h1>Colles</h1>
          <p>Indiquez votre groupe pour voir votre semaine.</p>
        </header>
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
    <main>
      <header className="page-heading">
        <div>
          <h1>Colles</h1>
          <p>
            Groupe {groupe}{autreGroupe && " (consultation)"}
            {semaine.periode && ` · ${semaine.periode.libelle}`}
          </p>
        </div>
        <form action="/colles" className="flex items-center gap-2">
          <input type="hidden" name="semaine" value={lundi} />
          <label className="sr-only" htmlFor="groupe-vue">Voir le groupe</label>
          <select id="groupe-vue" name="groupe" defaultValue={groupe} className="h-11 px-3 text-[14px]">
            {Array.from({ length: GROUPE_MAX }, (_, i) => i + 1).map((g) => (
              <option key={g} value={g}>Groupe {g}{g === u.groupe_colle ? " (moi)" : ""}</option>
            ))}
          </select>
          <button type="submit" className="puce h-11">Voir</button>
        </form>
      </header>

      <div className="page-stack">
        <section aria-label="Semaine">
          <nav aria-label="Changer de semaine" className="-mx-3 flex items-center justify-between gap-2">
            <Link href={lien(ajouterJours(lundi, -7))} aria-label="Semaine précédente"
                  className="grid h-11 w-11 place-items-center rounded-full hover:bg-[var(--muted)]">
              <Fleche d="m15 6-6 6 6 6" />
            </Link>
            <div className="text-center">
              <p className="text-[16px] font-medium">{titreSemaine}</p>
              <p className="text-[13px] text-[var(--muted-foreground)]">
                {semaine.numero ? `Colle n°\u00a0${semaine.numero} · rotation ${semaine.rotation}` : "Aucune colle prévue"}
                {lundi !== lundiCourant && (
                  <> · <Link href={lien(lundiCourant)} className="font-medium text-[var(--primary)]">cette semaine</Link></>
                )}
              </p>
            </div>
            <Link href={lien(ajouterJours(lundi, 7))} aria-label="Semaine suivante"
                  className="grid h-11 w-11 place-items-center rounded-full hover:bg-[var(--muted)]">
              <Fleche d="m9 6 6 6-6 6" />
            </Link>
          </nav>

          {semaine.notes.length > 0 && (
            <ul className="mt-3 space-y-1 text-[14px] text-[var(--muted-foreground)]">
              {semaine.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          )}

          <ol className="mt-4">
            {JOURS.map((nom, i) => {
              const jour = ajouterJours(lundi, i);
              const colles = semaine.colles.filter((c) => jourParis(new Date(c.debut)) === jour);
              const replis = semaine.colles.filter(
                (c) => c.alternative && jourParis(new Date(c.alternative.debut)) === jour,
              );
              const estAujourdhui = jour === aujourdhui;
              if (i === 5 && colles.length === 0 && replis.length === 0) return null; // samedi vide
              return (
                <li key={jour} className="flex gap-4 border-b py-4 last:border-b-0">
                  <p className={`w-14 shrink-0 text-[14px] ${estAujourdhui
                    ? "font-semibold text-[var(--primary)]" : "text-[var(--muted-foreground)]"}`}>
                    {nom.slice(0, 3).toLowerCase()}. {Number(jour.slice(8))}
                  </p>
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    {colles.length === 0 && replis.length === 0 && (
                      <p className="text-[14px] text-[var(--muted-foreground)]">—</p>
                    )}
                    {colles.map((c) => <CarteColle key={c.id} c={c} />)}
                    {replis.map((c) => <CarteRepli key={`${c.id}-repli`} c={c} />)}
                  </div>
                </li>
              );
            })}
          </ol>

          {semaine.colles.length === 0 && prochaineSemaine && (
            <Link href={lien(lundiDe(jourParis(new Date(prochaineSemaine.debut))))} className="lien-discret">
              Prochaine colle{"\u00a0"}: {jourCourt(prochaineSemaine.debut)} →
            </Link>
          )}
        </section>

        <section aria-labelledby="a-venir">
          <h2 id="a-venir" className="etiquette">À venir</h2>
          {aVenir.length === 0 ? (
            <p className="py-3 text-[15px] text-[var(--muted-foreground)]">
              Aucune colle prévue dans le colloscope actuel.
            </p>
          ) : (
            <ul>
              {aVenir.map((c) => (
                <li key={c.id} className="flex items-baseline gap-3 border-b py-3 last:border-b-0">
                  <span className="w-20 shrink-0 text-[14px] text-[var(--muted-foreground)]">{jourCourt(c.debut)}</span>
                  <span className="min-w-0 flex-1 truncate text-[16px]">{c.matiere}</span>
                  <span className="shrink-0 text-[14px] text-[var(--muted-foreground)]">
                    {heure(c.debut)} · {salle(c.salle)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {semaine.periode && semaine.periode.notes.length > 0 && (
          <details className="text-[14px] text-[var(--muted-foreground)]">
            <summary className="min-h-11 cursor-pointer py-3 font-medium text-[var(--foreground)]">
              Consignes du colloscope
            </summary>
            <ul className="space-y-2 leading-snug">
              {semaine.periode.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </details>
        )}

        {!autreGroupe && (
          <section aria-labelledby="mon-groupe">
            <h2 id="mon-groupe" className="etiquette mb-2">Mon groupe</h2>
            <ReglageGroupe groupe={u.groupe_colle} max={GROUPE_MAX} />
          </section>
        )}
      </div>
    </main>
  );
}

function Fleche({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
  );
}

function fmtJour(jour: string, options: Intl.DateTimeFormatOptions) {
  return new Date(`${jour}T12:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", ...options });
}

function CarteColle({ c }: { c: ColleVue }) {
  return (
    <article className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-3">
        <PastilleMatiere nom={c.matiere} couleur={c.couleur} className="!text-[16px] !text-[var(--foreground)]" />
        <span className="shrink-0 text-[14px] font-medium">{plage(c.debut, c.fin)}</span>
      </div>
      <p className="text-[13px] text-[var(--muted-foreground)]">
        {c.colleur} · salle {salle(c.salle)} · {c.creneau}
      </p>
      {c.alternative && (
        <p className="text-[13px] text-[var(--muted-foreground)]">
          Ou {jourCourt(c.alternative.debut)}, {plage(c.alternative.debut, c.alternative.fin)},
          salle {salle(c.alternative.salle)}, {c.alternative.condition}.
        </p>
      )}
      {c.notes.map((n) => (
        <p key={n} className="text-[13px] italic text-[var(--muted-foreground)]">{n}</p>
      ))}
    </article>
  );
}

/** Créneau de repli (P2 le vendredi) : affiché en retrait, pour mémoire. */
function CarteRepli({ c }: { c: ColleVue }) {
  const a = c.alternative!;
  return (
    <article className="flex flex-col gap-0.5 opacity-75">
      <div className="flex items-baseline justify-between gap-3">
        <PastilleMatiere nom={`${c.matiere} (repli)`} couleur={c.couleur} />
        <span className="shrink-0 text-[13px]">{plage(a.debut, a.fin)}</span>
      </div>
      <p className="text-[13px] text-[var(--muted-foreground)]">
        {c.colleur} · salle {salle(a.salle)}, {a.condition}
      </p>
    </article>
  );
}
