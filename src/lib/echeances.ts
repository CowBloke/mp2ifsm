import "server-only";
import { query } from "./db";

export type EcheanceVue = {
  id: number;
  titre: string;
  kind: string;
  matiere: string | null;
  couleur: string | null;
  due_at: string;
  details: string | null;
  auteur: string;
  created_by: string;
};

export async function echeancesAVenir(limite = 20): Promise<EcheanceVue[]> {
  return query<EcheanceVue>(
    `select e.id, e.titre, e.kind::text as kind, sj.nom as matiere, sj.couleur,
            e.due_at, e.details, u.display_name as auteur, e.created_by
       from echeance e join app_user u on u.id = e.created_by
       left join subject sj on sj.id = e.subject_id
      where e.deleted_at is null and e.due_at > now() - interval '12 hours'
      order by e.due_at asc
      limit $1`,
    [limite],
  );
}

/** « demain », « dans 3 jours », « aujourd'hui » */
export function quand(due: string | Date, maintenant = new Date()): string {
  const d = new Date(due);
  const jours = Math.round(
    (new Date(d.toDateString()).getTime() - new Date(maintenant.toDateString()).getTime())
    / 86_400_000,
  );
  if (jours < 0) return "en retard";
  if (jours === 0) return "aujourd’hui";
  if (jours === 1) return "demain";
  if (jours < 7) return `dans ${jours} jours`;
  if (jours < 14) return "dans une semaine";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}
