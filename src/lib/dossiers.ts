import "server-only";
import { query } from "./db";
import { PROFONDEUR_MAX_DOSSIERS, type KindDossier } from "./constantes";
import {
  chemin, destinations, libelleChemin, type DossierBase, type GestionDossier,
} from "./arbre-dossiers";

/*
 * Lecture des dossiers. Toute la liste d'un type est chargée d'un coup
 * (quelques dizaines de lignes) ; l'arborescence se construit ensuite
 * en mémoire, voir arbre-dossiers.ts.
 */

export type DossierVue = DossierBase & {
  kind: KindDossier;
  couleur: string | null;
  matiere: string | null;
  rang: number;
  created_by: string;
  createur: string;
  /** Éléments rangés directement dans ce dossier (hors corbeille / archives). */
  nb_elements: number;
};

export async function listerDossiers(kind: KindDossier): Promise<DossierVue[]> {
  return query<DossierVue>(
    `select f.id, f.kind, f.parent_id, f.subject_id, f.nom, f.created_by,
            u.display_name as createur, sj.nom as matiere, sj.couleur,
            coalesce(sj.position, 0) + case when sj.id is null then 1000000 else 0 end as rang,
            case f.kind
              when 'document' then (select count(*) from document x
                                     where x.folder_id = f.id and x.deleted_at is null)
              else (select count(*) from deck x
                     where x.folder_id = f.id and x.archived_at is null)
            end::int as nb_elements
       from dossier f
       join app_user u on u.id = f.created_by
       left join subject sj on sj.id = f.subject_id
      where f.kind = $1
      order by f.id`,
    [kind],
  );
}

/** Les droits et les destinations du menu de gestion d'un dossier. */
export function gestionDe(
  d: DossierVue,
  tous: DossierVue[],
  u: { id: string; role: "member" | "admin" },
  matieres: Array<{ id: number; nom: string }>,
): GestionDossier {
  const peutModifier = u.role === "admin" || d.created_by === u.id;
  return {
    id: d.id, kind: d.kind, nom: d.nom,
    racine: d.parent_id === null, subjectId: d.subject_id, parentId: d.parent_id,
    peutModifier,
    peutCreerEnfant: chemin(tous, d.id).length < PROFONDEUR_MAX_DOSSIERS,
    matieres,
    destinations: peutModifier
      ? destinations(tous, {
          deplace: d.id, avecMatiere: d.kind === "deck",
          racine: d.kind === "deck" ? "Hors dossier" : "Racine",
        })
      : [],
  };
}

/** « Mathématiques › Analyse » pour chaque dossier, par id. */
export function cheminsDe(tous: DossierVue[]): Record<number, string> {
  return Object.fromEntries(tous.map((d) => [d.id, libelleChemin(tous, d.id)]));
}
