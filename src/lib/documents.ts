import "server-only";
import { query, queryOne } from "./db";
import { PLAFOND_GLOBAL, QUOTA_MEMBRE } from "./stockage";

/*
 * Modèles de lecture du dépôt de documents.
 *
 * Les fichiers vivent sur le SSD ; cette table ne contient que les
 * métadonnées. Aucune requête ne renvoie `storage_name` vers le
 * client : le nom sur disque ne quitte jamais le serveur.
 */

export type DocumentVue = {
  id: number;
  original_name: string;
  mime: string;
  taille: number;
  subject_id: number | null;
  matiere: string | null;
  couleur: string | null;
  chapitre: string | null;
  tags: string[];
  uploaded_by: string;
  uploader: string;
  created_at: string;
  deleted_at: string | null;
  purge_after: string | null;
};

const CHAMPS = `
  d.id, d.original_name, d.mime, d.taille, d.subject_id, sj.nom as matiere, sj.couleur,
  d.chapitre,
  d.tags, d.uploaded_by, u.display_name as uploader, d.created_at,
  d.deleted_at, d.purge_after`;

export async function documentsRecents(limite = 20): Promise<DocumentVue[]> {
  return query<DocumentVue>(
    `select ${CHAMPS} from document d join app_user u on u.id = d.uploaded_by
      left join subject sj on sj.id = d.subject_id
      where d.deleted_at is null
      order by d.created_at desc limit $1`,
    [limite],
  );
}

/** `matiere` : id de la matière, "" = sans matière, null = toutes. */
export async function documentsParMatiere(
  matiere: string | null,
  chapitre: string | null,
): Promise<DocumentVue[]> {
  return query<DocumentVue>(
    `select ${CHAMPS} from document d join app_user u on u.id = d.uploaded_by
      left join subject sj on sj.id = d.subject_id
      where d.deleted_at is null
        and ($1::text is null or coalesce(d.subject_id::text, '') = $1)
        and ($2::text is null or coalesce(d.chapitre, '') = $2)
      order by d.created_at desc limit 500`,
    [matiere, chapitre],
  );
}

/**
 * Recherche sur le nom de fichier, les tags et le nom de la personne
 * qui a déposé. Plein texte pour les deux premiers, ILIKE pour le
 * troisième (il vit dans une autre table).
 */
export async function rechercherDocuments(terme: string): Promise<DocumentVue[]> {
  const q = terme.trim();
  if (q.length < 2) return [];
  return query<DocumentVue>(
    `select ${CHAMPS} from document d join app_user u on u.id = d.uploaded_by
      left join subject sj on sj.id = d.subject_id
      where d.deleted_at is null
        and (d.recherche @@ plainto_tsquery('french', $1)
             or d.original_name ilike '%' || $1 || '%'
             or u.display_name  ilike '%' || $1 || '%'
             or exists (select 1 from unnest(d.tags) t where t ilike '%' || $1 || '%'))
      order by ts_rank(d.recherche, plainto_tsquery('french', $1)) desc,
               d.created_at desc
      limit 100`,
    [q],
  );
}

export async function lireDocument(id: number): Promise<DocumentVue | null> {
  return queryOne<DocumentVue>(
    `select ${CHAMPS} from document d join app_user u on u.id = d.uploaded_by
      left join subject sj on sj.id = d.subject_id
      where d.id = $1`,
    [id],
  );
}

/** Arborescence matière → chapitres, avec les compteurs. */
export type NoeudMatiere = {
  subject_id: number | null;
  matiere: string | null;
  couleur: string | null;
  total: number;
  chapitres: Array<{ chapitre: string | null; n: number; taille: number }>;
};

export async function arborescence(): Promise<NoeudMatiere[]> {
  const lignes = await query<{
    subject_id: number | null; matiere: string | null; couleur: string | null;
    chapitre: string | null; n: number; taille: number;
  }>(
    `select d.subject_id, sj.nom as matiere, sj.couleur, d.chapitre,
            count(*)::int as n, coalesce(sum(d.taille), 0)::bigint as taille
       from document d left join subject sj on sj.id = d.subject_id
      where d.deleted_at is null
      group by d.subject_id, sj.nom, sj.couleur, sj.position, d.chapitre
      order by d.subject_id is null, sj.position, sj.nom, d.chapitre nulls last`,
  );

  const parMatiere = new Map<string, NoeudMatiere>();
  for (const l of lignes) {
    const cle = String(l.subject_id ?? "");
    let n = parMatiere.get(cle);
    if (!n) {
      n = { subject_id: l.subject_id, matiere: l.matiere, couleur: l.couleur, total: 0, chapitres: [] };
      parMatiere.set(cle, n);
    }
    n.chapitres.push({ chapitre: l.chapitre, n: l.n, taille: l.taille });
    n.total += l.n;
  }
  return [...parMatiere.values()];
}

export type Usage = {
  utilise_membre: number;
  quota_membre: number;
  utilise_global: number;
  plafond_global: number;
  fichiers_membre: number;
  fichiers_total: number;
};

/**
 * Occupation disque. Les fichiers en suppression douce comptent encore :
 * ils occupent réellement le SSD jusqu'à la purge.
 */
export async function usage(userId: string): Promise<Usage> {
  const r = await queryOne<{
    membre: number; global: number; nb_membre: number; nb_total: number;
  }>(
    `select coalesce(sum(taille) filter (where uploaded_by = $1::uuid), 0)::bigint as membre,
            coalesce(sum(taille), 0)::bigint                                       as global,
            count(*) filter (where uploaded_by = $1::uuid)::int                     as nb_membre,
            count(*)::int                                                          as nb_total
       from (select taille, uploaded_by from document union all
             select taille, uploaded_by from card_image) fichiers`,
    [userId],
  );
  return {
    utilise_membre: r?.membre ?? 0,
    quota_membre: QUOTA_MEMBRE,
    utilise_global: r?.global ?? 0,
    plafond_global: PLAFOND_GLOBAL,
    fichiers_membre: r?.nb_membre ?? 0,
    fichiers_total: r?.nb_total ?? 0,
  };
}

/** Corbeille : supprimés mais pas encore purgés. */
export async function corbeille(userId: string, estAdmin: boolean): Promise<DocumentVue[]> {
  return query<DocumentVue>(
    `select ${CHAMPS} from document d join app_user u on u.id = d.uploaded_by
      left join subject sj on sj.id = d.subject_id
      where d.deleted_at is not null
        and ($2::boolean or d.uploaded_by = $1::uuid)
      order by d.deleted_at desc limit 200`,
    [userId, estAdmin],
  );
}

export const CHAPITRES_CONNUS = async (): Promise<string[]> => {
  const r = await query<{ chapitre: string }>(
    `select distinct chapitre from document where chapitre is not null
     union select distinct chapitre from deck
     order by 1`,
  );
  return r.map((x) => x.chapitre);
};
