-- =====================================================================
-- mp2ifsm.com — invariant tests.
--
-- Each block either proves an operation works, or proves that an
-- INVALID operation is rejected by the database. Run against a scratch
-- database; it rolls everything back at the end.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/test_invariants.sql
-- =====================================================================

begin;
set constraints all deferred;

create temporary table t_result(name text, ok boolean) on commit drop;

create or replace function t_expect_failure(p_name text, p_sql text, p_expect text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    insert into t_result values (p_name, false);   -- should not have succeeded
  exception when others then
    insert into t_result values (p_name, position(p_expect in sqlerrm) > 0 or p_expect = '');
  end;
end $$;

-- ---------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------
do $$
declare
  alice uuid; bob uuid; carol uuid; admin uuid;
  m bigint; o_a bigint; o_b bigint; o_c bigint;
begin
  insert into app_user (email, display_name, password_hash, role)
    values ('admin@test','T_Admin','x','admin') returning id into admin;
  insert into app_user (email, display_name, password_hash)
    values ('a@test','T_Alice','x') returning id into alice;
  insert into app_user (email, display_name, password_hash)
    values ('b@test','T_Bob','x') returning id into bob;
  insert into app_user (email, display_name, password_hash)
    values ('c@test','T_Carol','x') returning id into carol;

  perform record_deposit(alice, 10000, 'ext-1');
  perform record_deposit(bob,   10000, 'ext-2');
  perform record_deposit(carol, 10000, 'ext-3');

  insert into market (slug, question, closes_at, created_by)
    values ('t-test-m','Question de test suffisamment longue ?', now() + interval '1 day', admin)
    returning id into m;
  insert into outcome (market_id, label, position) values (m,'A',0) returning id into o_a;
  insert into outcome (market_id, label, position) values (m,'B',1) returning id into o_b;
  insert into outcome (market_id, label, position) values (m,'C',2) returning id into o_c;

  -- Amounts chosen so the division leaves a remainder.
  perform place_bet(alice, o_a, 100, 'bet-alice-1');
  perform place_bet(bob,   o_a, 200, 'bet-bob-1');
  perform place_bet(carol, o_b, 401, 'bet-carol-1');
end $$;

-- ---------------------------------------------------------------------
-- Positive checks
-- ---------------------------------------------------------------------
insert into t_result
select 'depot credite le portefeuille',
       wallet_balance((select id from app_user where email='a@test')) = 10000 - 100;

insert into t_result
select 'sequestre du marche detient la cagnotte',
       account_balance(market_account_id((select id from market where slug='t-test-m'))) = 701;

-- Idempotency: replaying the same keys must change nothing.
do $$
declare alice uuid := (select id from app_user where email='a@test');
        o_a bigint := (select o.id from outcome o join market m on m.id=o.market_id
                        where m.slug='t-test-m' and o.label='A');
begin
  perform place_bet(alice, o_a, 100, 'bet-alice-1');    -- same key
  perform record_deposit(alice, 10000, 'ext-1');        -- same source_ref
end $$;

-- Comptages limités aux fixtures : la base peut déjà contenir des
-- données réelles ou de démonstration.
insert into t_result
select 'rejouer la meme cle est sans effet',
       wallet_balance((select id from app_user where email='a@test')) = 9900
   and (select count(*) from bet b join market m on m.id = b.market_id
         where m.slug = 't-test-m') = 3
   and (select count(*) from external_deposit
         where source_ref in ('ext-1','ext-2','ext-3')) = 3;

-- ---------------------------------------------------------------------
-- Negative checks — the database must refuse all of these
-- ---------------------------------------------------------------------
select t_expect_failure('transfert desequilibre refuse', $q$
  do $x$
  declare t bigint;
  begin
    insert into ledger_transfer (kind, idempotency_key) values ('deposit','bad-1')
      returning id into t;
    insert into ledger_entry (transfer_id, account_id, amount)
      values (t, external_account_id(), -500),
             (t, wallet_id((select id from app_user where email='a@test')), 400);
  end $x$;
  set constraints all immediate;
$q$, 'does not balance');

select t_expect_failure('transfert a une seule ecriture refuse', $q$
  do $x$
  declare t bigint;
  begin
    insert into ledger_transfer (kind, idempotency_key) values ('deposit','bad-2')
      returning id into t;
    insert into ledger_entry (transfer_id, account_id, amount)
      values (t, wallet_id((select id from app_user where email='a@test')), 400);
  end $x$;
  set constraints all immediate;
$q$, 'double-entry needs at least 2');

select t_expect_failure('decouvert refuse', $q$
  select request_withdrawal((select id from app_user where email='a@test'), 999999, 'w-bad')
$q$, 'INSUFFICIENT_FUNDS');

select t_expect_failure('mise superieure au solde refusee', $q$
  select place_bet((select id from app_user where email='a@test'),
                   (select o.id from outcome o join market m on m.id=o.market_id
                     where m.slug='t-test-m' and o.label='A'), 999999, 'bet-bad')
$q$, 'INSUFFICIENT_FUNDS');

select t_expect_failure('cle d''idempotence dupliquee refusee', $q$
  select post_transfer('deposit','deposit:ext-1', external_account_id(),
                       wallet_id((select id from app_user where email='a@test')), 100)
$q$, 'duplicate key');

select t_expect_failure('modification du grand livre refusee', $q$
  update ledger_entry set amount = amount + 1000 where id = (select min(id) from ledger_entry)
$q$, 'append-only');

select t_expect_failure('suppression du grand livre refusee', $q$
  delete from ledger_entry where id = (select min(id) from ledger_entry)
$q$, 'append-only');

select t_expect_failure('suppression d''un pari refusee', $q$
  delete from bet where id = (select min(id) from bet)
$q$, 'definitifs');

select t_expect_failure('modification du montant d''un pari refusee', $q$
  update bet set amount = 1 where id = (select min(id) from bet)
$q$, 'definitifs');

select t_expect_failure('deuxieme compte externe refuse', $q$
  insert into account (kind) values ('external')
$q$, 'account_external_key');

select t_expect_failure('compte utilisateur avec market_id refuse', $q$
  insert into account (kind, user_id, market_id)
    values ('user', (select id from app_user where email='a@test'), 1)
$q$, 'account_shape');

select t_expect_failure('marche avec un seul resultat refuse', $q$
  do $x$
  declare m bigint;
  begin
    insert into market (slug, question, closes_at, created_by)
      values ('t-solo-m','Un marche avec un seul resultat ?', now() + interval '1 day',
              (select id from app_user where email='admin@test'))
      returning id into m;
    insert into outcome (market_id, label, position) values (m, 'Seul', 0);
  end $x$;
  set constraints all immediate;
$q$, 'at least 2 outcomes');

select t_expect_failure('resolution avec un resultat d''un autre marche refusee', $q$
  do $x$
  declare m2 bigint;
  begin
    insert into market (slug, question, closes_at, created_by)
      values ('t-autre-m','Un autre marche pour le test croise ?', now() + interval '1 day',
              (select id from app_user where email='admin@test'))
      returning id into m2;
    insert into outcome (market_id, label, position) values (m2,'X',0),(m2,'Y',1);
    update market set status='resolved', resolved_at=now(),
                      resolved_by=(select id from app_user where email='admin@test'),
                      resolved_outcome_id=(select o.id from outcome o
                                            join market m on m.id=o.market_id
                                           where m.slug='t-test-m' and o.label='A')
     where id = m2;
  end $x$;
  set constraints all immediate;
$q$, 'market_resolved_outcome_fk');

select t_expect_failure('marche resolu sans resultat gagnant refuse', $q$
  do $x$ begin
    update market set status = 'resolved' where slug = 't-test-m';
  end $x$;
  set constraints all immediate;
$q$, 'market_resolution_coherent');

select t_expect_failure('montant de pari negatif refuse', $q$
  select place_bet((select id from app_user where email='a@test'),
                   (select o.id from outcome o join market m on m.id=o.market_id
                     where m.slug='t-test-m' and o.label='A'), -500, 'bet-neg')
$q$, '');

-- ---------------------------------------------------------------------
-- Settlement: conservation to the centime, remainder to the last winner
-- ---------------------------------------------------------------------
do $$
declare
  m bigint := (select id from market where slug='t-test-m');
  o_a bigint := (select id from outcome where market_id=m and label='A');
  pool bigint;
begin
  pool := settle_market(m, o_a, (select id from app_user where email='admin@test'));
  insert into t_result values ('reglement rend la cagnotte exacte', pool = 701);
end $$;

-- pool 701, mises gagnantes 300 :
--   Alice floor(100*701/300) = 233
--   Bob   floor(200*701/300) = 467, + reste 1 = 468   (dernier gagnant)
insert into t_result
select 'gain d''Alice = 233',
       wallet_balance((select id from app_user where email='a@test')) = 9900 + 233;
insert into t_result
select 'gain de Bob = 468 (reste inclus)',
       wallet_balance((select id from app_user where email='b@test')) = 9800 + 468;
insert into t_result
select 'le perdant ne recoit rien',
       wallet_balance((select id from app_user where email='c@test')) = 10000 - 401;
insert into t_result
select 'sequestre vide apres reglement',
       account_balance(market_account_id((select id from market where slug='t-test-m'))) = 0;
insert into t_result
select 'aucune creation ni destruction de monnaie',
       (select coalesce(sum(amount),0) from ledger_entry) = 0;
insert into t_result
select 'total interne = depots nets',
       (select coalesce(sum(e.amount),0) from ledger_entry e join account a on a.id=e.account_id
         where a.kind in ('user','market'))
       = (select coalesce(sum(amount),0) from external_deposit)
       - (select coalesce(sum(amount),0) from withdrawal);

select t_expect_failure('double reglement refuse', $q$
  select settle_market((select id from market where slug='t-test-m'),
                       (select id from outcome where market_id=(select id from market where slug='t-test-m') and label='A'),
                       (select id from app_user where email='admin@test'))
$q$, 'MARKET_ALREADY_RESOLVED');

select t_expect_failure('pari sur un marche regle refuse', $q$
  select place_bet((select id from app_user where email='a@test'),
                   (select id from outcome where market_id=(select id from market where slug='t-test-m') and label='A'),
                   100, 'bet-after-close')
$q$, 'MARKET_CLOSED');

-- ---------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------
\echo ''
select case when ok then 'PASS' else 'FAIL' end as resultat, name as controle
  from t_result order by ok, name;

\echo ''
do $$
declare failed integer;
begin
  select count(*) into failed from t_result where not ok;
  if failed > 0 then
    raise exception '% test(s) en echec', failed;
  end if;
  raise notice 'TOUS LES TESTS PASSENT (% controles)', (select count(*) from t_result);
end $$;

rollback;
