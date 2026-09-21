import "server-only";
import { query, queryOne } from "./db";
import { listerPaquets, type PaquetVue } from "./fiches";

/*
 * Données de l'accueil. Une requête par carte du tableau de bord,
 * lancées en parallèle par la page — aucune ne dépend des autres.
 *
 * Tout ce qui touche aux fiches ne compte que les paquets SUIVIS :
 * un paquet non suivi n'entre ni dans les révisions, ni dans les
 * statistiques, ni dans les rappels.
 */

/** Paquets suivis par le membre (jointure réutilisée par chaque requête). */
const SUIVI = `join deck_subscription ab on ab.deck_id = k.deck_id and ab.user_id = $1::uuid`;

export type ResumeFiches = {
  a_reviser: number;        // dues maintenant (apprentissage + révision)
  nouvelles: number;        // neuves jamais vues
  revises_aujourdhui: number;
  paquets_suivis: number;
  paquets: PaquetVue[];     // paquets suivis, les plus chargés d'abord
  prochain_paquet: { slug: string; titre: string; n: number } | null;
};

export async function resumeFiches(userId: string): Promise<ResumeFiches> {
  const [global, prochain, paquets] = await Promise.all([
    queryOne<{ a_reviser: number; revises_aujourdhui: number }>(
      `select
         (select count(*) from card_state s join card k on k.id = s.card_id ${SUIVI}
           where s.user_id = $1::uuid and s.due <= now() and k.deleted_at is null)::int
           as a_reviser,
         (select count(*) from review_log rl join card k on k.id = rl.card_id ${SUIVI}
           where rl.user_id = $1::uuid and rl.reviewed_at >= date_trunc('day', now()))::int
           as revises_aujourdhui`,
      [userId],
    ),
    // Le paquet suivi qui a le plus de cartes dues : c'est là qu'on
    // renvoie le bouton « Réviser » de l'accueil.
    queryOne<{ slug: string; titre: string; n: number }>(
      `select d.slug, d.titre, count(*)::int as n
         from card_state s
         join card k on k.id = s.card_id and k.deleted_at is null
         ${SUIVI}
         join deck d on d.id = k.deck_id and d.archived_at is null
        where s.user_id = $1::uuid and s.due <= now()
        group by d.slug, d.titre
        order by n desc limit 1`,
      [userId],
    ),
    listerPaquets(userId),
  ]);

  const suivis = paquets.filter((p) => p.abonne);
  const charge = (p: PaquetVue) => p.apprentissage + p.a_revoir + p.nouvelles;
  return {
    a_reviser: global?.a_reviser ?? 0,
    nouvelles: suivis.reduce((n, p) => n + p.nouvelles, 0),
    revises_aujourdhui: global?.revises_aujourdhui ?? 0,
    paquets_suivis: suivis.length,
    paquets: [...suivis].sort((a, b) => charge(b) - charge(a)),
    prochain_paquet: prochain,
  };
}

export type ActiviteFiches = {
  /** 14 derniers jours, du plus ancien à aujourd'hui. */
  jours: Array<{ jour: string; n: number }>;
  /** Jours consécutifs avec au moins une révision, jusqu'à aujourd'hui ou hier. */
  serie: number;
  /** Part de réponses ≥ Correct sur les cartes mûres, 30 jours. */
  retention: number | null;
  /** Cartes dues dans les 7 prochains jours (hors aujourd'hui). */
  semaine: number;
};

export async function activiteFiches(userId: string): Promise<ActiviteFiches> {
  const [jours, historique, retention, semaine] = await Promise.all([
    query<{ jour: string; n: number }>(
      `select to_char(j::date, 'YYYY-MM-DD') as jour, count(rl.id)::int as n
         from generate_series(current_date - 13, current_date, '1 day') j
         left join (select rl.id, rl.reviewed_at from review_log rl
                      join card k on k.id = rl.card_id ${SUIVI}
                     where rl.user_id = $1::uuid
                       and rl.reviewed_at >= current_date - 13) rl
                on rl.reviewed_at::date = j::date
        group by j order by j`,
      [userId],
    ),
    // Jours distincts de révision, pour la série (bornée à un an).
    query<{ jour: string }>(
      `select distinct to_char(rl.reviewed_at::date, 'YYYY-MM-DD') as jour
         from review_log rl join card k on k.id = rl.card_id ${SUIVI}
        where rl.user_id = $1::uuid and rl.reviewed_at >= current_date - 366
        order by 1 desc`,
      [userId],
    ),
    queryOne<{ total: number; reussies: number }>(
      `select count(*)::int as total, count(*) filter (where rl.rating > 1)::int as reussies
         from review_log rl join card k on k.id = rl.card_id ${SUIVI}
        where rl.user_id = $1::uuid and rl.state = 'Review'
          and rl.reviewed_at > now() - interval '30 days'`,
      [userId],
    ),
    queryOne<{ n: number }>(
      `select count(*)::int as n
         from card_state s join card k on k.id = s.card_id and k.deleted_at is null ${SUIVI}
        where s.user_id = $1::uuid
          and s.due >= current_date + 1 and s.due < current_date + 8`,
      [userId],
    ),
  ]);

  return {
    jours,
    serie: serie(historique.map((h) => h.jour), jours.at(-1)?.jour ?? ""),
    retention: retention && retention.total > 0 ? retention.reussies / retention.total : null,
    semaine: semaine?.n ?? 0,
  };
}

/** Longueur de la série de jours consécutifs finissant aujourd'hui ou hier. */
export function serie(joursDesc: string[], aujourdhui: string): number {
  const jour = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86_400_000;
  if (!aujourdhui || joursDesc.length === 0) return 0;
  let attendu = jour(aujourdhui);
  if (jour(joursDesc[0]) === attendu - 1) attendu -= 1;   // pas encore révisé aujourd'hui
  let n = 0;
  for (const j of joursDesc) {
    if (jour(j) !== attendu) break;
    n++;
    attendu--;
  }
  return n;
}

export type MarcheBientot = {
  id: number; slug: string; question: string; closes_at: string;
  cagnotte: number; ma_mise: number;
};

/** Marchés ouverts dont la fermeture approche — l'angle « ne rate pas ça ». */
export async function marchesBientotFermes(userId: string, limite = 3): Promise<MarcheBientot[]> {
  return query<MarcheBientot>(
    `select m.id, m.slug, m.question, m.closes_at,
            coalesce((select sum(b.amount) from bet b where b.market_id = m.id), 0)::bigint
              as cagnotte,
            coalesce((select sum(b.amount) from bet b
                       where b.market_id = m.id and b.user_id = $1::uuid), 0)::bigint
              as ma_mise
       from market m
      where m.status = 'open' and m.closes_at > now()
      order by m.closes_at asc
      limit $2`,
    [userId, limite],
  );
}
