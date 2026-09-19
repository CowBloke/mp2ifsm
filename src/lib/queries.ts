import "server-only";
import { query, queryOne } from "./db";

/*
 * Modeles de lecture. Tout calcul d'argent (solde, cagnotte, cotes) est
 * fait par PostgreSQL a partir du grand livre et des mises : aucune
 * valeur monetaire n'est derivee ailleurs.
 */

export type IssueVue = {
  id: number;
  label: string;
  position: number;
  mises: number;      // total mise sur cette issue, en centimes
  parieurs: number;
  ma_mise: number;    // mise de l'utilisateur courant sur cette issue
};

export type MarcheVue = {
  id: number;
  slug: string;
  question: string;
  description: string | null;
  closes_at: string;
  status: "open" | "closed" | "resolved" | "cancelled";
  resolved_outcome_id: number | null;
  cagnotte: number;   // centimes
  parieurs: number;
  ma_mise: number;    // total mise par l'utilisateur courant
  mon_gain: number | null; // gain encaisse si le marche est regle
  issues: IssueVue[];
};

/* Un marche ouvert dont l'heure de fermeture est passee n'accepte plus
 * de mise : on le presente comme ferme sans attendre l'admin. */
const STATUT_EFFECTIF = `
  case when m.status = 'open' and m.closes_at <= now() then 'closed'
       else m.status::text end`;

const SELECT_MARCHE = `
  select m.id, m.slug, m.question, m.description,
         m.closes_at, ${STATUT_EFFECTIF} as status, m.resolved_outcome_id,
         coalesce(p.cagnotte, 0)  as cagnotte,
         coalesce(p.parieurs, 0)  as parieurs,
         coalesce(mine.ma_mise, 0) as ma_mise,
         mine.mon_gain,
         coalesce(o.issues, '[]'::json) as issues
    from market m
    left join lateral (
      select sum(b.amount) as cagnotte, count(distinct b.user_id) as parieurs
        from bet b where b.market_id = m.id
    ) p on true
    left join lateral (
      select sum(b.amount) as ma_mise,
             sum(coalesce((select e.amount from ledger_entry e
                            join account a on a.id = e.account_id
                           where e.transfer_id = b.payout_transfer_id
                             and a.kind = 'user'), 0)) as mon_gain
        from bet b where b.market_id = m.id and b.user_id = $1::uuid
    ) mine on true
    left join lateral (
      select json_agg(x order by x.position) as issues from (
        select o.id, o.label, o.position,
               coalesce((select sum(b.amount) from bet b where b.outcome_id = o.id), 0) as mises,
               coalesce((select count(distinct b.user_id) from bet b where b.outcome_id = o.id), 0) as parieurs,
               coalesce((select sum(b.amount) from bet b
                          where b.outcome_id = o.id and b.user_id = $1::uuid), 0) as ma_mise
          from outcome o where o.market_id = m.id
      ) x
    ) o on true`;

/** Fil d'accueil : marches ouverts d'abord, puis les plus recents. */
export async function listerMarches(userId: string | null): Promise<MarcheVue[]> {
  return query<MarcheVue>(
    `${SELECT_MARCHE}
      where m.status <> 'cancelled'
      order by (${STATUT_EFFECTIF} = 'open') desc,
               (${STATUT_EFFECTIF} = 'closed') desc,
               m.closes_at asc
      limit 100`,
    [userId],
  );
}

export async function lireMarche(slug: string, userId: string | null): Promise<MarcheVue | null> {
  return queryOne<MarcheVue>(`${SELECT_MARCHE} where m.slug = $2`, [userId, slug]);
}

/** Tous les marches, y compris annules — vue admin. */
export async function listerMarchesAdmin(userId: string): Promise<MarcheVue[]> {
  return query<MarcheVue>(
    `${SELECT_MARCHE} order by (${STATUT_EFFECTIF} = 'closed') desc, m.closes_at desc limit 200`,
    [userId],
  );
}

/** Solde : toujours une somme du grand livre, jamais une colonne. */
export async function soldeCentimes(userId: string): Promise<number> {
  const row = await queryOne<{ solde: number }>(
    `select wallet_balance($1::uuid) as solde`,
    [userId],
  );
  return row?.solde ?? 0;
}

export type Position = {
  bet_id: number;
  market_id: number;
  slug: string;
  question: string;
  closes_at: string;
  status: string;
  outcome_label: string;
  outcome_id: number;
  amount: number;
  payout: number | null;
  gagnant: boolean | null;
  created_at: string;
};

async function positions(userId: string, reglees: boolean): Promise<Position[]> {
  return query<Position>(
    `select b.id as bet_id, m.id as market_id, m.slug, m.question, m.closes_at,
            ${STATUT_EFFECTIF} as status,
            o.label as outcome_label, o.id as outcome_id,
            b.amount, b.created_at,
            (select e.amount from ledger_entry e
               join account a on a.id = e.account_id
              where e.transfer_id = b.payout_transfer_id and a.kind = 'user') as payout,
            case when m.resolved_outcome_id is null then null
                 else m.resolved_outcome_id = b.outcome_id end as gagnant
       from bet b
       join market m  on m.id = b.market_id
       join outcome o on o.id = b.outcome_id
      where b.user_id = $1::uuid
        and m.status ${reglees ? "in ('resolved','cancelled')" : "not in ('resolved','cancelled')"}
      order by b.created_at desc
      limit 200`,
    [userId],
  );
}

export const positionsOuvertes = (u: string) => positions(u, false);
export const positionsReglees = (u: string) => positions(u, true);

export type LigneClassement = {
  user_id: string;
  display_name: string;
  solde: number;
  depose: number;
  retire: number;
  engage: number;     // mises bloquees dans des marches non regles
  resultat: number;   // solde + engage - depose net : la vraie performance
  paris: number;
};

/**
 * Classement par performance nette, pas par solde brut : deposer plus
 * ne doit pas faire monter au classement.
 */
export async function classement(): Promise<LigneClassement[]> {
  return query<LigneClassement>(
    `with w as (
       select u.id as user_id, u.display_name, a.id as account_id
         from app_user u join account a on a.kind = 'user' and a.user_id = u.id
     )
     select w.user_id, w.display_name,
            coalesce((select sum(e.amount) from ledger_entry e where e.account_id = w.account_id), 0) as solde,
            coalesce((select sum(d.amount) from external_deposit d where d.user_id = w.user_id), 0) as depose,
            coalesce((select sum(x.amount)  from withdrawal x      where x.user_id = w.user_id), 0) as retire,
            coalesce((select sum(b.amount) from bet b join market m on m.id = b.market_id
                       where b.user_id = w.user_id
                         and m.status not in ('resolved','cancelled')), 0) as engage,
            coalesce((select count(*) from bet b where b.user_id = w.user_id), 0) as paris,
            coalesce((select sum(e.amount) from ledger_entry e where e.account_id = w.account_id), 0)
              + coalesce((select sum(b.amount) from bet b join market m on m.id = b.market_id
                           where b.user_id = w.user_id
                             and m.status not in ('resolved','cancelled')), 0)
              - coalesce((select sum(d.amount) from external_deposit d where d.user_id = w.user_id), 0)
              + coalesce((select sum(x.amount) from withdrawal x where x.user_id = w.user_id), 0) as resultat
       from w
      order by resultat desc, solde desc, w.display_name asc`,
  );
}

export type MouvementVue = {
  id: number;
  kind: string;
  amount: number;
  memo: string | null;
  created_at: string;
  question: string | null;
  slug: string | null;
};

/** Relevé du portefeuille : une ligne par mouvement, du plus recent. */
export async function mouvements(userId: string, limite = 50): Promise<MouvementVue[]> {
  return query<MouvementVue>(
    `select t.id, t.kind::text as kind, e.amount, t.memo, t.created_at,
            m.question, m.slug
       from ledger_entry e
       join account a        on a.id = e.account_id
       join ledger_transfer t on t.id = e.transfer_id
       left join market m     on m.id = t.market_id
      where a.kind = 'user' and a.user_id = $1::uuid
      order by t.created_at desc, t.id desc
      limit $2`,
    [userId, limite],
  );
}

export type Rapprochement = { controle: string; valeur: number; ok: boolean };

/**
 * Version applicative du rapprochement (db/reconcile.sql), affichee
 * dans la page admin. Prouve que la somme du grand livre vaut zero et
 * que les avoirs internes egalent les depots externes nets.
 */
export async function rapprochement(): Promise<Rapprochement[]> {
  const row = await queryOne<{
    total: number; interne: number; net_externe: number;
    desequilibres: number; decouverts: number; sequestres_non_vides: number;
  }>(
    `select
       (select coalesce(sum(amount),0) from ledger_entry) as total,
       (select coalesce(sum(e.amount),0) from ledger_entry e
          join account a on a.id = e.account_id where a.kind in ('user','market')) as interne,
       (select coalesce((select sum(amount) from external_deposit),0)
             - coalesce((select sum(amount) from withdrawal),0)) as net_externe,
       (select count(*) from (select transfer_id from ledger_entry
          group by transfer_id having sum(amount) <> 0 or count(*) < 2) z) as desequilibres,
       (select count(*) from (select a.id from account a
          join ledger_entry e on e.account_id = a.id
         where a.kind='user' group by a.id having sum(e.amount) < 0) z) as decouverts,
       (select count(*) from market m
          join account a on a.kind='market' and a.market_id = m.id
         where m.status in ('resolved','cancelled')
           and coalesce((select sum(amount) from ledger_entry where account_id=a.id),0) <> 0) as sequestres_non_vides`,
  );
  if (!row) return [];
  return [
    { controle: "Somme du grand livre = 0", valeur: row.total, ok: row.total === 0 },
    { controle: "Transferts déséquilibrés", valeur: row.desequilibres, ok: row.desequilibres === 0 },
    { controle: "Avoirs internes", valeur: row.interne, ok: row.interne === row.net_externe },
    { controle: "Dépôts externes nets", valeur: row.net_externe, ok: row.interne === row.net_externe },
    { controle: "Portefeuilles à découvert", valeur: row.decouverts, ok: row.decouverts === 0 },
    { controle: "Séquestres non vidés", valeur: row.sequestres_non_vides, ok: row.sequestres_non_vides === 0 },
  ];
}
