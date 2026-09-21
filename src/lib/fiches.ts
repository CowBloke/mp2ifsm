import "server-only";
import { jetonRevision } from "./revision-token";
import { query, queryOne } from "./db";
import { apercuIntervalles, type Apercu, type EtatDb } from "./fsrs";

/*
 * Modèles de lecture des fiches.
 *
 * Les paquets et les cartes appartiennent à la classe ; l'état de
 * révision appartient à chaque membre (table card_state, clé
 * (user_id, card_id)). Aucune requête ici ne mélange les deux.
 */

export type PaquetVue = {
  id: number;
  slug: string;
  titre: string;
  subject_id: number | null;
  /** Nom de la matière, null = sans matière. */
  matiere: string | null;
  couleur: string | null;
  matiere_archivee: boolean;
  /** Seuls les paquets suivis entrent dans les révisions et statistiques. */
  abonne: boolean;
  chapitre: string;
  description: string | null;
  created_by: string;
  total: number;
  nouvelles: number;
  apprentissage: number;
  a_revoir: number;
  signalements: number;
};

/* Décompte par paquet. Les cartes neuves ne sont pas plafonnées par jour. */
const SELECT_PAQUET = `
  select d.id, d.slug, d.titre, d.subject_id, sj.nom as matiere, sj.couleur,
         coalesce(sj.archived_at is not null, false) as matiere_archivee,
         exists (select 1 from deck_subscription ab
                  where ab.deck_id = d.id and ab.user_id = $1::uuid) as abonne,
         d.chapitre, d.description, d.created_by,
         coalesce(c.total, 0)                      as total,
         coalesce(c.nouvelles, 0)                  as nouvelles,
         coalesce(c.apprentissage, 0)              as apprentissage,
         coalesce(c.a_revoir, 0)                   as a_revoir,
         coalesce(r.signalements, 0)               as signalements
    from deck d
    left join subject sj on sj.id = d.subject_id
    left join lateral (
      select count(*) as total,
             count(*) filter (where s.user_id is null)                             as nouvelles,
             count(*) filter (where s.state in ('Learning','Relearning')
                                and s.due <= now())                                as apprentissage,
             count(*) filter (where s.state = 'Review' and s.due <= now())          as a_revoir
        from card k
        left join card_state s on s.card_id = k.id and s.user_id = $1::uuid
       where k.deck_id = d.id and k.deleted_at is null
    ) c on true
    left join lateral (
      select count(*) as signalements
        from card_report rp join card k2 on k2.id = rp.card_id
       where k2.deck_id = d.id and rp.resolved_at is null
    ) r on true
   where d.archived_at is null`;

export async function listerPaquets(userId: string): Promise<PaquetVue[]> {
  return query<PaquetVue>(
    `${SELECT_PAQUET} order by sj.id is null, sj.position, sj.nom, d.chapitre, d.titre`,
    [userId],
  );
}

export async function lirePaquet(slug: string, userId: string): Promise<PaquetVue | null> {
  return queryOne<PaquetVue>(`${SELECT_PAQUET} and d.slug = $2`, [userId, slug]);
}

export type CarteARevisier = {
  jeton: string;
  card_id: number;
  recto: string;
  verso: string;
  auteur: string;
  author_id: string;
  deck_titre: string;
  deck_slug: string;
  signalee: boolean;
  etat: EtatDb | null;
  apercu: Apercu[];
  restant: { nouvelles: number; apprentissage: number; a_revoir: number };
};

/**
 * Carte suivante d'une session.
 *
 * Ordre : ce qui est en apprentissage d'abord (intervalles courts, à
 * enchaîner), puis les révisions dues, puis les cartes neuves. Renvoie
 * null quand la session est terminée — ou quand le membre ne suit pas
 * ce paquet : seuls les paquets suivis entrent dans les révisions.
 */
export async function prochaineCarte(
  userId: string,
  deckId: number,
): Promise<CarteARevisier | null> {
  const ligne = await queryOne<{
    card_id: number; recto: string; verso: string; auteur: string; author_id: string;
    deck_titre: string; deck_slug: string; signalee: boolean;
  } & Partial<EtatDb>>(
    `select k.id as card_id, k.recto, k.verso, k.author_id,
            u.display_name as auteur, d.titre as deck_titre, d.slug as deck_slug,
            exists (select 1 from card_report rp
                     where rp.card_id = k.id and rp.resolved_at is null) as signalee,
            s.state::text as state, s.due, s.stability, s.difficulty,
            s.elapsed_days, s.scheduled_days, s.learning_steps,
            s.reps, s.lapses, s.last_review
       from card k
       join deck d     on d.id = k.deck_id
       join app_user u on u.id = k.author_id
       left join card_state s on s.card_id = k.id and s.user_id = $1::uuid
      where k.deck_id = $2 and k.deleted_at is null
        and (s.user_id is null or s.due <= now())
        and exists (select 1 from deck_subscription ab
                     where ab.deck_id = k.deck_id and ab.user_id = $1::uuid)
      order by
        case when s.state in ('Learning','Relearning') then 0
             when s.state = 'Review'                   then 1
             else 2 end,
        s.due asc nulls last,
        k.id asc
      limit 1`,
    [userId, deckId],
  );
  if (!ligne) return null;

  const etat: EtatDb | null = ligne.state
    ? {
        state: ligne.state as EtatDb["state"],
        due: ligne.due!, stability: ligne.stability!, difficulty: ligne.difficulty!,
        elapsed_days: ligne.elapsed_days!, scheduled_days: ligne.scheduled_days!,
        learning_steps: ligne.learning_steps!, reps: ligne.reps!, lapses: ligne.lapses!,
        last_review: ligne.last_review ?? null,
      }
    : null;

  const restant = await compterRestant(userId, deckId);

  const maintenant = new Date();
  return {
    jeton: jetonRevision(userId, ligne.card_id, etat?.reps ?? 0, maintenant),
    card_id: ligne.card_id, recto: ligne.recto, verso: ligne.verso,
    auteur: ligne.auteur, author_id: ligne.author_id,
    deck_titre: ligne.deck_titre, deck_slug: ligne.deck_slug,
    signalee: ligne.signalee,
    etat,
    // Intervalles calculés côté serveur, affichés au-dessus des boutons.
    apercu: apercuIntervalles(etat, maintenant),
    restant,
  };
}

export async function compterRestant(userId: string, deckId: number) {
  const r = await queryOne<{ nouvelles: number; apprentissage: number; a_revoir: number }>(
    `select count(*) filter (where s.user_id is null)::int                as nouvelles,
            count(*) filter (where s.state in ('Learning','Relearning')
                               and s.due <= now())::int                    as apprentissage,
            count(*) filter (where s.state = 'Review' and s.due <= now())::int as a_revoir
       from card k
       left join card_state s on s.card_id = k.id and s.user_id = $1::uuid
      where k.deck_id = $2 and k.deleted_at is null`,
    [userId, deckId],
  );
  return r ?? { nouvelles: 0, apprentissage: 0, a_revoir: 0 };
}

export type CarteListe = {
  id: number; recto: string; verso: string; auteur: string; author_id: string;
  created_at: string; updated_at: string; revisions: number; signalements: number;
  etat: string | null; due: string | null;
};

export async function listerCartes(deckId: number, userId: string): Promise<CarteListe[]> {
  return query<CarteListe>(
    `select k.id, k.recto, k.verso, u.display_name as auteur, k.author_id,
            k.created_at, k.updated_at,
            (select count(*) from card_revision cr where cr.card_id = k.id)::int as revisions,
            (select count(*) from card_report rp
              where rp.card_id = k.id and rp.resolved_at is null)::int           as signalements,
            s.state::text as etat, s.due
       from card k
       join app_user u on u.id = k.author_id
       left join card_state s on s.card_id = k.id and s.user_id = $2::uuid
      where k.deck_id = $1 and k.deleted_at is null
      order by k.created_at desc
      limit 500`,
    [deckId, userId],
  );
}

export type Revision = {
  id: number; recto: string; verso: string; auteur: string;
  edited_at: string; motif: string | null;
};

export async function historiqueCarte(cardId: number): Promise<Revision[]> {
  return query<Revision>(
    `select cr.id, cr.recto, cr.verso, u.display_name as auteur, cr.edited_at, cr.motif
       from card_revision cr join app_user u on u.id = cr.edited_by
      where cr.card_id = $1
      order by cr.edited_at desc`,
    [cardId],
  );
}

/* ------------------------------------------------------------------ */
/* Statistiques                                                        */
/* ------------------------------------------------------------------ */

export type StatsPaquet = {
  retention: number | null;       // part de réponses >= Correct sur les révisions mûres
  revisions_30j: number;
  cartes_vues: number;
  total: number;
  a_venir: Array<{ jour: string; n: number }>;
  repartition: Array<{ etat: string; n: number }>;
};

export async function statsPaquet(deckId: number, userId: string): Promise<StatsPaquet> {
  const [retention, aVenir, repartition, totaux] = await Promise.all([
    // Rétention : sur les cartes déjà mûres (state Review au moment de
    // la révision), part des réponses autres que « Encore ».
    queryOne<{ total: number; reussies: number }>(
      `select count(*)::int as total,
              count(*) filter (where rl.rating > 1)::int as reussies
         from review_log rl join card k on k.id = rl.card_id
        where k.deck_id = $1 and rl.user_id = $2::uuid and rl.state = 'Review'
          and rl.reviewed_at > now() - interval '90 days'`,
      [deckId, userId],
    ),
    query<{ jour: string; n: number }>(
      `select to_char(j::date, 'YYYY-MM-DD') as jour,
              count(s.card_id)::int as n
         from generate_series(current_date, current_date + 6, '1 day') j
         left join card_state s
                on s.user_id = $2::uuid and s.due::date = j::date
                   and exists (select 1 from card k where k.id = s.card_id
                               and k.deck_id = $1 and k.deleted_at is null)
        group by j order by j`,
      [deckId, userId],
    ),
    query<{ etat: string; n: number }>(
      `select coalesce(s.state::text, 'New') as etat, count(*)::int as n
         from card k
         left join card_state s on s.card_id = k.id and s.user_id = $2::uuid
        where k.deck_id = $1 and k.deleted_at is null
        group by 1`,
      [deckId, userId],
    ),
    queryOne<{ total: number; vues: number; revisions: number }>(
      `select (select count(*) from card where deck_id = $1 and deleted_at is null)::int as total,
              (select count(*) from card_state s join card k on k.id = s.card_id
                where k.deck_id = $1 and s.user_id = $2::uuid)::int as vues,
              (select count(*) from review_log rl join card k on k.id = rl.card_id
                where k.deck_id = $1 and rl.user_id = $2::uuid
                  and rl.reviewed_at > now() - interval '30 days')::int as revisions`,
      [deckId, userId],
    ),
  ]);

  return {
    retention: retention && retention.total > 0 ? retention.reussies / retention.total : null,
    revisions_30j: totaux?.revisions ?? 0,
    cartes_vues: totaux?.vues ?? 0,
    total: totaux?.total ?? 0,
    a_venir: aVenir,
    repartition,
  };
}

export type LigneHeatmap = {
  user_id: string;
  display_name: string;
  jours: Array<{ jour: string; n: number }>;
  total: number;
};

/**
 * Heatmap de classe — strictement opt-in.
 *
 * Seuls les membres ayant coché `partage_stats` et suivant le paquet
 * apparaissent. Le filtre est dans le SQL, pas dans l'affichage : un
 * membre qui n'a pas consenti ne sort jamais de la base.
 */
export async function heatmapClasse(deckId: number, jours = 30): Promise<LigneHeatmap[]> {
  const lignes = await query<{ user_id: string; display_name: string; jour: string; n: number }>(
    `select u.id as user_id, u.display_name,
            to_char(rl.reviewed_at::date, 'YYYY-MM-DD') as jour,
            count(*)::int as n
       from review_log rl
       join card k     on k.id = rl.card_id
       join app_user u on u.id = rl.user_id
      join deck_subscription ab on ab.deck_id = k.deck_id and ab.user_id = u.id
      where k.deck_id = $1
        and u.partage_stats = true
        and rl.reviewed_at > now() - ($2::int || ' days')::interval
      group by u.id, u.display_name, rl.reviewed_at::date
      order by u.display_name`,
    [deckId, jours],
  );

  const parMembre = new Map<string, LigneHeatmap>();
  for (const l of lignes) {
    let m = parMembre.get(l.user_id);
    if (!m) {
      m = { user_id: l.user_id, display_name: l.display_name, jours: [], total: 0 };
      parMembre.set(l.user_id, m);
    }
    m.jours.push({ jour: l.jour, n: l.n });
    m.total += l.n;
  }
  return [...parMembre.values()].sort((a, b) => b.total - a.total);
}
