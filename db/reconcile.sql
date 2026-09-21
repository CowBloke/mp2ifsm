-- Fichier en UTF-8. Sans cette ligne, psql sous Windows lit les accents
-- selon la page de code de la console et les enregistre corrompus.
set client_encoding = 'UTF8';

-- =====================================================================
-- mp2ifsm.com — reconciliation.
--
-- Proves that the ledger is internally consistent and that every centime
-- inside the system is backed by a real external deposit.
--
--   psql "$DATABASE_URL" -f db/reconcile.sql
--
-- Every row of the final report must read OK. Run it after settlements,
-- after a deposit pull, and from cron.
-- =====================================================================

\pset border 2
\echo ''
\echo '=== Rapprochement du grand livre — mp2ifsm ==='
\echo ''

with
-- 1. Double entry: the whole ledger sums to zero.
total as (
  select coalesce(sum(amount), 0) as v from ledger_entry
),
-- 2. Every individual transfer sums to zero and has >= 2 legs.
unbalanced as (
  select count(*) as v from (
    select transfer_id
      from ledger_entry
     group by transfer_id
    having sum(amount) <> 0 or count(*) < 2
  ) x
),
-- 3. Money held inside the system: member wallets + open market escrows.
internal as (
  select coalesce(sum(e.amount), 0) as v
    from ledger_entry e
    join account a on a.id = e.account_id
   where a.kind in ('user', 'market')
),
-- 4. The external counterparty account (negative of what it sent in).
external_leg as (
  select coalesce(sum(e.amount), 0) as v
    from ledger_entry e
    join account a on a.id = e.account_id
   where a.kind = 'external'
),
-- 5. Net external flow taken from the business tables, computed
--    independently of the ledger so the two can be compared.
deposits as   (select coalesce(sum(amount), 0) as v from external_deposit),
withdrawals as(select coalesce(sum(amount), 0) as v from withdrawal),
net_external as (
  select (select v from deposits) - (select v from withdrawals) as v
),
-- 6. No wallet is negative.
overdrawn as (
  select count(*) as v from (
    select a.id
      from account a
      join ledger_entry e on e.account_id = a.id
     where a.kind = 'user'
     group by a.id
    having sum(e.amount) < 0
  ) x
),
-- 7. A settled market must have emptied its escrow.
leaky_markets as (
  select count(*) as v
    from market m
    join account a on a.kind = 'market' and a.market_id = m.id
   where m.status in ('resolved', 'cancelled')
     and coalesce((select sum(amount) from ledger_entry where account_id = a.id), 0) <> 0
),
-- 8. Each market's escrow equals staked minus paid out.
escrow_mismatch as (
  select count(*) as v
    from market m
    join account a on a.kind = 'market' and a.market_id = m.id
   where coalesce((select sum(amount) from ledger_entry where account_id = a.id), 0)
      <> coalesce((select sum(amount) from bet where market_id = m.id), 0)
       - coalesce((select sum(e.amount)
                     from bet b
                     join ledger_entry e on e.transfer_id = b.payout_transfer_id
                     join account wa on wa.id = e.account_id and wa.kind = 'user'
                    where b.market_id = m.id), 0)
)
select * from (
  values
    ('1. Somme totale du grand livre = 0',
     (select v::text from total),
     case when (select v from total) = 0 then 'OK' else 'ECHEC' end),

    ('2. Transferts desequilibres',
     (select v::text from unbalanced),
     case when (select v from unbalanced) = 0 then 'OK' else 'ECHEC' end),

    ('3. Avoirs internes (portefeuilles + sequestres)',
     (select v::text from internal), ''),

    ('4. Compte externe (oppose des avoirs internes)',
     (select v::text from external_leg),
     case when (select v from internal) + (select v from external_leg) = 0
          then 'OK' else 'ECHEC' end),

    ('5. Depots nets externes (depots - retraits)',
     (select v::text from net_external),
     case when (select v from internal) = (select v from net_external)
          then 'OK' else 'ECHEC' end),

    ('6. Portefeuilles a decouvert',
     (select v::text from overdrawn),
     case when (select v from overdrawn) = 0 then 'OK' else 'ECHEC' end),

    ('7. Marches regles avec sequestre non vide',
     (select v::text from leaky_markets),
     case when (select v from leaky_markets) = 0 then 'OK' else 'ECHEC' end),

    ('8. Sequestres incoherents avec les mises',
     (select v::text from escrow_mismatch),
     case when (select v from escrow_mismatch) = 0 then 'OK' else 'ECHEC' end)
) as report(controle, valeur_centimes, resultat);

\echo ''
\echo '--- Solde par membre (centimes) ---'
select u.display_name,
       coalesce(sum(e.amount), 0) as solde
  from app_user u
  join account a on a.kind = 'user' and a.user_id = u.id
  left join ledger_entry e on e.account_id = a.id
 group by u.display_name
 order by solde desc;
