import "server-only";
import { query, queryOne } from "./db";
import { listerPaquets } from "./fiches";

/*
 * Données de l'accueil. Une requête par carte du tableau de bord,
 * lancées en parallèle par la page — aucune ne dépend des autres.
 */

export type ResumeFiches = {
  a_reviser: number;        // dues maintenant (apprentissage + révision)
  nouvelles: number;        // neuves jamais vues
  revises_aujourdhui: number;
  paquets: number;
  prochain_paquet: { slug: string; titre: string; n: number } | null;
};

export async function resumeFiches(userId: string): Promise<ResumeFiches> {
  const [global, prochain, paquets] = await Promise.all([
    queryOne<ResumeFiches>(
      `select
         (select count(*) from card_state s join card k on k.id = s.card_id
           where s.user_id = $1::uuid and s.due <= now() and k.deleted_at is null)::int
           as a_reviser,
         (select count(*) from review_log
           where user_id = $1::uuid and reviewed_at >= date_trunc('day', now()))::int
           as revises_aujourdhui,
         (select count(*) from deck where archived_at is null)::int as paquets`,
      [userId],
    ),
    // Le paquet qui a le plus de cartes dues : c'est là qu'on renvoie
    // le bouton « Réviser » de l'accueil.
    queryOne<{ slug: string; titre: string; n: number }>(
      `select d.slug, d.titre, count(*)::int as n
         from card_state s
         join card k on k.id = s.card_id and k.deleted_at is null
         join deck d on d.id = k.deck_id and d.archived_at is null
        where s.user_id = $1::uuid and s.due <= now()
        group by d.slug, d.titre
        order by n desc limit 1`,
      [userId],
    ),
    listerPaquets(userId),
  ]);

  return {
    a_reviser: global?.a_reviser ?? 0,
    nouvelles: paquets.reduce((n, p) => n + p.nouvelles, 0),
    revises_aujourdhui: global?.revises_aujourdhui ?? 0,
    paquets: global?.paquets ?? 0,
    prochain_paquet: prochain,
  };
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
