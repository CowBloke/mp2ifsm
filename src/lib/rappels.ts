import "server-only";
import { query } from "./db";
import { deMatiere, heure, prochainesColles, salle, type ColleVue } from "./colles";
import { jourParis } from "./colloscope";
import type { ResumeFiches } from "./dashboard";

/*
 * Rappels — uniquement dans le portail : aucun courriel, aucune
 * notification poussée. Ils sont calculés à l'affichage, jamais
 * stockés, donc toujours à jour avec le colloscope et les révisions.
 *
 *   - colles des 36 prochaines heures, seulement si le membre a un groupe ;
 *   - cartes dues, seulement dans les paquets suivis ;
 *   - échéances de la classe dans les 48 heures.
 */

export type Rappel = {
  id: string;
  genre: "colle" | "fiches" | "echeance";
  titre: string;
  detail: string;
  lien: string;
  couleur: string | null;
  /** Dans moins de trois heures (ou déjà en retard) : mis en avant. */
  urgent: boolean;
};

const HORIZON_COLLES_MS = 36 * 3_600_000;
const URGENCE_MS = 3 * 3_600_000;

function quandCourt(iso: string, maintenant: Date): string {
  const jour = jourParis(new Date(iso));
  if (jour === jourParis(maintenant)) return "aujourd’hui";
  if (jour === jourParis(new Date(maintenant.getTime() + 86_400_000))) return "demain";
  return new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "long" });
}

export function rappelsColles(colles: ColleVue[], maintenant = new Date()): Rappel[] {
  return colles
    .filter((c) => new Date(c.debut).getTime() - maintenant.getTime() < HORIZON_COLLES_MS)
    .map((c) => {
      const avant = new Date(c.debut).getTime() - maintenant.getTime();
      const enCours = avant <= 0;
      return {
        id: `colle:${c.id}`,
        genre: "colle" as const,
        titre: enCours
          ? `Colle ${deMatiere(c.matiere)} en cours`
          : `Colle ${deMatiere(c.matiere)} ${quandCourt(c.debut, maintenant)} à ${heure(c.debut)}`,
        detail: `${c.colleur} · salle ${salle(c.salle)}${c.alternative ? " (ou créneau de repli, voir le colloscope)" : ""}`,
        lien: "/colles",
        couleur: c.couleur,
        urgent: avant < URGENCE_MS,
      };
    });
}

export function rappelFiches(r: ResumeFiches): Rappel[] {
  const dues = r.a_reviser;
  if (dues === 0) return [];
  return [{
    id: "fiches",
    genre: "fiches",
    titre: `${dues} carte${dues > 1 ? "s" : ""} à réviser`,
    detail: r.prochain_paquet
      ? `Surtout dans « ${r.prochain_paquet.titre} » (${r.prochain_paquet.n})`
      : "Dans vos paquets suivis",
    lien: r.prochain_paquet ? `/fiches/${r.prochain_paquet.slug}/reviser` : "/fiches",
    couleur: r.paquets.find((p) => p.slug === r.prochain_paquet?.slug)?.couleur ?? null,
    urgent: false,
  }];
}

export async function rappelsEcheances(maintenant = new Date()): Promise<Rappel[]> {
  const lignes = await query<{ id: number; titre: string; kind: string; due_at: string;
                               matiere: string | null; couleur: string | null }>(
    `select e.id, e.titre, e.kind::text as kind, e.due_at, sj.nom as matiere, sj.couleur
       from echeance e left join subject sj on sj.id = e.subject_id
      where e.deleted_at is null and e.due_at > $1 and e.due_at < $1 + interval '48 hours'
      order by e.due_at limit 3`,
    [maintenant],
  );
  return lignes.map((e) => ({
    id: `echeance:${e.id}`,
    genre: "echeance",
    titre: `${e.kind} ${quandCourt(new Date(e.due_at).toISOString(), maintenant)}\u00a0: ${e.titre}`,
    detail: e.matiere ?? "Échéance de la classe",
    lien: "/",
    couleur: e.couleur,
    urgent: new Date(e.due_at).getTime() - maintenant.getTime() < URGENCE_MS,
  }));
}

/** Rappels d'un membre, les plus pressants d'abord. */
export async function rappels(
  groupe: number | null, fiches: ResumeFiches, maintenant = new Date(),
): Promise<Rappel[]> {
  const [colles, echeances] = await Promise.all([
    groupe === null ? Promise.resolve([]) : prochainesColles(groupe, 4, 2, maintenant),
    rappelsEcheances(maintenant),
  ]);
  const tous = [...rappelsColles(colles, maintenant), ...echeances, ...rappelFiches(fiches)];
  return tous.sort((a, b) => Number(b.urgent) - Number(a.urgent));
}
