import "server-only";
import { join } from "node:path";
import { mkdir, statfs } from "node:fs/promises";
import { query, tx } from "./db";
import { ErreurMetier } from "./errors";
import { listerPaquets, type PaquetVue } from "./fiches";
import { RACINE, cheminDe, detecterType, ecrire, empreinte, supprimerDuDisque } from "./stockage";

/*
 * Rubrique Cours : chapitres publiés par une source externe (voir
 * /api/cours/publier), lus par les membres. Les PDF vivent dans
 * STORAGE_ROOT/cours ; le texte de chaque page est en base pour la
 * recherche (l'assistant renvoie la page exacte à ouvrir).
 */

export const DOSSIER_COURS = join(RACINE, "cours");
export const TAILLE_MAX_COURS = 100 * 1024 * 1024;
/** Plafond propre à la rubrique (elle n'entame pas le quota des membres). */
const PLAFOND_COURS = Number(process.env.QUOTA_COURS ?? 5 * 1024 ** 3);
const GENRES = ["cours", "correction", "dm", "td", "autre"] as const;
export type GenreFichier = (typeof GENRES)[number];

// MARK: Lecture

export type FichierCours = {
  id: number; cle: string; genre: GenreFichier; titre: string; taille: number; pages: number; updated_at: string;
};
export type ChapitreCours = {
  id: number; cle: string; numero: number | null; titre: string; resume: string;
  subject_id: number | null; matiere: string | null; couleur: string | null;
  fichiers: FichierCours[];
  paquets: PaquetVue[];
};

export async function catalogue(userId: string): Promise<ChapitreCours[]> {
  const [chapitres, fichiers, liens, paquets] = await Promise.all([
    query<Omit<ChapitreCours, "fichiers" | "paquets">>(
      `select c.id, c.cle, c.numero, c.titre, c.resume, c.subject_id, s.nom as matiere, s.couleur
         from cours_chapitre c left join subject s on s.id = c.subject_id
        order by coalesce(s.position, 1000), s.nom nulls last, c.position, c.numero nulls last, c.titre`),
    query<FichierCours & { chapitre_id: number }>(
      `select id, chapitre_id, cle, genre, titre, taille, pages, updated_at
         from cours_fichier order by position, genre, titre`),
    query<{ chapitre_id: number; deck_id: number }>(
      `select chapitre_id, deck_id from cours_paquet order by position, deck_id`),
    listerPaquets(userId),
  ]);
  const parId = new Map(paquets.map((p) => [p.id, p]));
  return chapitres.map((c) => ({
    ...c,
    fichiers: fichiers.filter((f) => f.chapitre_id === c.id).map(({ chapitre_id: _, ...f }) => f),
    paquets: liens.filter((l) => l.chapitre_id === c.id).flatMap((l) => parId.get(l.deck_id) ?? []),
  }));
}

/** Fichier à servir ; null s'il n'existe pas. */
export async function lireFichierCours(id: number) {
  const [f] = await query<{ storage_name: string; titre: string }>(
    `select storage_name, titre from cours_fichier where id = $1`, [id]);
  return f ?? null;
}

// Repères d'extrait : caractères à usage privé, absents de tout texte de cours.
export const DEBUT_EXTRAIT = "\uE000", FIN_EXTRAIT = "\uE001";
const OPTIONS_EXTRAIT = `StartSel=${DEBUT_EXTRAIT}, StopSel=${FIN_EXTRAIT}, MaxWords=32, MinWords=14, MaxFragments=2, FragmentDelimiter=" … "`;

export type ResultatRecherche = {
  fichier_id: number; fichier: string; genre: GenreFichier;
  chapitre: string; matiere: string | null; couleur: string | null;
  page: number; extrait: string;
};

/**
 * Assistant de cours : les pages qui répondent le mieux à la question,
 * avec un extrait où les mots trouvés sont encadrés de DEBUT_EXTRAIT / FIN_EXTRAIT.
 * Plein texte en français (« dérivées » trouve « dérivée »), puis
 * repli sur une recherche littérale pour les formules et les sigles.
 */
export async function rechercherCours(terme: string): Promise<ResultatRecherche[]> {
  const q = terme.trim().slice(0, 200);
  if (q.length < 2) return [];
  return query<ResultatRecherche>(
    `with r as (
       select p.fichier_id, p.numero, p.texte,
              ts_rank(p.recherche, websearch_to_tsquery('french', $1)) as rang
         from cours_page p
        where p.recherche @@ websearch_to_tsquery('french', $1)
           or p.texte ilike '%' || $2 || '%'
        order by rang desc, p.fichier_id, p.numero
        limit 40)
     select f.id as fichier_id, f.titre as fichier, f.genre, c.titre as chapitre,
            s.nom as matiere, s.couleur, r.numero as page,
            ts_headline('french', r.texte, websearch_to_tsquery('french', $1), $3)
              as extrait
       from r join cours_fichier f on f.id = r.fichier_id
       join cours_chapitre c on c.id = f.chapitre_id
       left join subject s on s.id = c.subject_id
      order by r.rang desc, f.id, r.numero`,
    [q, q.replace(/[\\%_]/g, (m) => `\\${m}`), OPTIONS_EXTRAIT],
  );
}

// MARK: Publication (source externe, jeton COURS_TOKEN)

function cle(v: unknown, motif = /^[a-z0-9][a-z0-9-]{0,79}$/): string {
  const s = String(v ?? "").trim().toLowerCase();
  if (!motif.test(s)) throw new ErreurMetier("COURS_CLE_INVALIDE");
  return s;
}

function texte(v: unknown, max: number, requis = true): string {
  const s = String(v ?? "").trim();
  if ((requis && !s) || s.length > max) throw new ErreurMetier("CHAMPS_MANQUANTS");
  return s;
}

function entier(v: unknown, defaut: number | null): number | null {
  if (v === undefined || v === null || v === "") return defaut;
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new ErreurMetier("CHAMPS_MANQUANTS");
  return n;
}

async function matiereParNom(nom: unknown): Promise<number | null> {
  const s = String(nom ?? "").trim();
  if (!s) return null;
  const [m] = await query<{ id: number }>(
    `select id from subject where lower(nom) = lower($1) order by archived_at nulls first limit 1`, [s]);
  if (!m) throw new ErreurMetier("MATIERE_INVALIDE");
  return m.id;
}

/** Crée ou met à jour un chapitre (clé stable). */
export async function publierChapitre(c: Record<string, unknown>): Promise<{ id: number }> {
  const subject = await matiereParNom(c.matiere);
  const numero = entier(c.numero, null);
  if (numero !== null && (numero < 0 || numero > 999)) throw new ErreurMetier("CHAMPS_MANQUANTS");
  const [r] = await query<{ id: number }>(
    `insert into cours_chapitre (cle, subject_id, numero, titre, resume, position)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (cle) do update set subject_id = excluded.subject_id, numero = excluded.numero,
       titre = excluded.titre, resume = excluded.resume, position = excluded.position, updated_at = now()
     returning id`,
    [cle(c.cle), subject, numero, texte(c.titre, 160), texte(c.resume, 2000, false), entier(c.position, 0)],
  );
  return r;
}

async function idChapitre(cleChapitre: unknown): Promise<number> {
  const [c] = await query<{ id: number }>(`select id from cours_chapitre where cle = $1`, [cle(cleChapitre)]);
  if (!c) throw new ErreurMetier("CHAPITRE_INTROUVABLE");
  return c.id;
}

/**
 * Publie (ou remplace) un PDF d'un chapitre avec le texte de ses pages.
 * L'ancien fichier n'est effacé du disque qu'une fois la base à jour.
 */
export async function publierFichier(
  meta: Record<string, unknown>, pdf: Buffer, pages: unknown,
): Promise<{ id: number; pages: number }> {
  if (detecterType(pdf, "application/pdf") !== "application/pdf") throw new ErreurMetier("TYPE_NON_AUTORISE");
  if (pdf.length > TAILLE_MAX_COURS) throw new ErreurMetier("FICHIER_TROP_GROS");
  const textes = Array.isArray(pages) ? pages.slice(0, 2000).map((p) => String(p ?? "").slice(0, 100_000)) : [];
  const genre = String(meta.genre ?? "cours") as GenreFichier;
  if (!GENRES.includes(genre)) throw new ErreurMetier("CHAMPS_MANQUANTS");
  const chapitre = await idChapitre(meta.chapitre);
  const cleFichier = cle(meta.cle, /^[a-z0-9][a-z0-9._-]{0,79}$/);
  const titre = texte(meta.titre, 160);

  let nouveau: string | undefined;
  try {
    const { id, ancien } = await tx(async (c) => {
      await c.query("select pg_advisory_xact_lock(4260, 2)");
      const [{ total }] = (await c.query<{ total: number }>(
        `select coalesce(sum(taille), 0)::bigint as total from cours_fichier
          where not (chapitre_id = $1 and cle = $2)`, [chapitre, cleFichier])).rows;
      if (total + pdf.length > PLAFOND_COURS) throw new ErreurMetier("QUOTA_DEPASSE");
      await mkdir(RACINE, { recursive: true, mode: 0o700 });
      const disque = await statfs(RACINE);
      if (disque.bavail * disque.bsize - pdf.length < 5 * 1024 ** 3) throw new ErreurMetier("ESPACE_INSUFFISANT");

      const avant = await c.query<{ storage_name: string }>(
        `select storage_name from cours_fichier where chapitre_id = $1 and cle = $2 for update`, [chapitre, cleFichier]);
      nouveau = await ecrire(DOSSIER_COURS, pdf);
      const r = await c.query<{ id: number }>(
        `insert into cours_fichier (chapitre_id, cle, genre, titre, storage_name, taille, sha256, pages, position)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict (chapitre_id, cle) do update set genre = excluded.genre, titre = excluded.titre,
           storage_name = excluded.storage_name, taille = excluded.taille, sha256 = excluded.sha256,
           pages = excluded.pages, position = excluded.position, updated_at = now()
         returning id`,
        [chapitre, cleFichier, genre, titre, nouveau, pdf.length, empreinte(pdf), textes.length, entier(meta.position, 0)]);
      const id = r.rows[0].id;
      await c.query(`delete from cours_page where fichier_id = $1`, [id]);
      if (textes.length) {
        await c.query(
          `insert into cours_page (fichier_id, numero, texte)
           select $1, n, t from unnest($2::text[]) with ordinality as x(t, n)`, [id, textes]);
      }
      return { id, ancien: avant.rows[0]?.storage_name };
    });
    if (ancien) await supprimerDuDisque(DOSSIER_COURS, ancien).catch(console.error);
    return { id, pages: textes.length };
  } catch (err) {
    if (nouveau) await supprimerDuDisque(DOSSIER_COURS, nouveau).catch(console.error);
    throw err;
  }
}

/** Remplace la liste des paquets proposés d'un chapitre (par slug, dans l'ordre donné). */
export async function lierPaquets(cleChapitre: unknown, slugs: unknown): Promise<{ paquets: number }> {
  const chapitre = await idChapitre(cleChapitre);
  const liste = Array.isArray(slugs) ? slugs.map((s) => String(s)).slice(0, 50) : [];
  return tx(async (c) => {
    const r = await c.query<{ id: number; slug: string }>(
      `select id, slug from deck where slug = any($1::text[]) and archived_at is null`, [liste]);
    if (r.rows.length !== new Set(liste).size) throw new ErreurMetier("PAQUET_INTROUVABLE");
    await c.query(`delete from cours_paquet where chapitre_id = $1`, [chapitre]);
    for (const [i, slug] of liste.entries()) {
      const deck = r.rows.find((d) => d.slug === slug)!;
      await c.query(`insert into cours_paquet (chapitre_id, deck_id, position) values ($1, $2, $3)
                     on conflict do nothing`, [chapitre, deck.id, i]);
    }
    return { paquets: r.rows.length };
  });
}

export async function retirerFichier(cleChapitre: unknown, cleFichier: unknown): Promise<void> {
  const chapitre = await idChapitre(cleChapitre);
  const [f] = await query<{ storage_name: string }>(
    `delete from cours_fichier where chapitre_id = $1 and cle = $2 returning storage_name`,
    [chapitre, cle(cleFichier, /^[a-z0-9][a-z0-9._-]{0,79}$/)]);
  if (!f) throw new ErreurMetier("INTROUVABLE");
  await supprimerDuDisque(DOSSIER_COURS, f.storage_name).catch(console.error);
}

export async function retirerChapitre(cleChapitre: unknown): Promise<void> {
  const chapitre = await idChapitre(cleChapitre);
  const fichiers = await query<{ storage_name: string }>(
    `select storage_name from cours_fichier where chapitre_id = $1`, [chapitre]);
  await query(`delete from cours_chapitre where id = $1`, [chapitre]);
  for (const f of fichiers) await supprimerDuDisque(DOSSIER_COURS, f.storage_name).catch(console.error);
}

/** Chemin disque d'un fichier de cours (nom revalidé). */
export function cheminCours(storageName: string): string {
  return cheminDe(DOSSIER_COURS, storageName);
}
