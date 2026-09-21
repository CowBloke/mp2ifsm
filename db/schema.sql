-- Fichier en UTF-8. Sans cette ligne, psql sous Windows lit les accents
-- selon la page de code de la console et les enregistre corrompus.
set client_encoding = 'UTF8';

-- =====================================================================
-- mp2ifsm.com — marché de prédiction parimutuel (classe MP2I/FSM)
--
-- Design rules enforced *by the database*, not by application code:
--
--  1. Money is an append-only double-entry ledger of integer centimes.
--     Every movement is one `ledger_transfer` with >= 2 `ledger_entry`
--     rows whose amounts sum to exactly zero (deferred constraint).
--  2. A balance is ALWAYS `select sum(amount) from ledger_entry ...`.
--     There is deliberately no balance column anywhere to UPDATE.
--  3. Ledger rows and bets are immutable: UPDATE/DELETE are blocked by
--     trigger, so a placed stake can never be unwound ("pas de revente").
--  4. Every transfer carries a unique idempotency key, so a retried
--     deposit / withdrawal / bet cannot double-spend.
--  5. Markets never mint or burn: a market escrow account must return to
--     exactly zero once settled (asserted in settle_market()).
--
-- Run with:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema.sql
-- =====================================================================

begin;

-- gen_random_uuid() is built into PostgreSQL 13+, so no extension
-- (and therefore no superuser) is required to install this schema.

-- ---------------------------------------------------------------------
-- Enumerations — illegal values are unrepresentable, not merely CHECKed
-- ---------------------------------------------------------------------
do $$ begin create type account_kind  as enum ('user','market','external');
exception when duplicate_object then null; end $$;

do $$ begin create type market_status as enum ('open','closed','resolved','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin create type transfer_kind as enum ('deposit','withdrawal','bet','payout','refund');
exception when duplicate_object then null; end $$;

do $$ begin create type user_role     as enum ('member','admin');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Immutability guard: used on every append-only table
-- ---------------------------------------------------------------------
create or replace function forbid_mutation() returns trigger
language plpgsql as $$
begin
  raise exception
    'table % is append-only (attempted %)', tg_table_name, tg_op
    using errcode = 'restrict_violation';
end $$;

-- ---------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------
create table if not exists app_user (
  id            uuid primary key default gen_random_uuid(),
  email         text not null check (position('@' in email) > 1),
  display_name  text not null check (length(btrim(display_name)) between 2 and 40),
  password_hash text not null,
  role          user_role not null default 'member',
  created_at    timestamptz not null default now()
);
create unique index if not exists app_user_email_key    on app_user (lower(email));
create unique index if not exists app_user_display_key  on app_user (lower(display_name));

create table if not exists user_session (
  token_hash  bytea primary key,
  user_id     uuid not null references app_user(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  check (expires_at > created_at)
);
create index if not exists user_session_user_idx on user_session (user_id);

-- Signup is gated by a class invite code so the market stays inside the class.
create table if not exists invite_code (
  code        text primary key check (length(code) between 4 and 64),
  max_uses    integer not null check (max_uses > 0),
  uses        integer not null default 0 check (uses >= 0),
  created_at  timestamptz not null default now(),
  check (uses <= max_uses)
);

-- ---------------------------------------------------------------------
-- Markets
-- ---------------------------------------------------------------------
create table if not exists market (
  id                  bigserial primary key,
  slug                text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
  question            text not null check (length(btrim(question)) between 8 and 200),
  description         text,
  closes_at           timestamptz not null,
  status              market_status not null default 'open',
  resolved_outcome_id bigint,
  resolved_at         timestamptz,
  resolved_by         uuid references app_user(id),
  created_by          uuid not null references app_user(id),
  created_at          timestamptz not null default now(),

  -- A market is resolved if and only if it names a winning outcome.
  constraint market_resolution_coherent check (
    (status = 'resolved') = (resolved_outcome_id is not null)
    and (status = 'resolved') = (resolved_at is not null)
    and (status = 'resolved') = (resolved_by is not null)
  ),
  constraint market_closes_after_creation check (closes_at > created_at)
);
create index if not exists market_status_idx on market (status, closes_at desc);

create table if not exists outcome (
  id        bigserial primary key,
  market_id bigint not null references market(id) on delete cascade,
  label     text not null check (length(btrim(label)) between 1 and 60),
  position  smallint not null check (position between 0 and 9),
  unique (market_id, position),
  unique (market_id, label),
  -- Target for market.resolved_outcome_id's composite FK below.
  unique (market_id, id)
);
create index if not exists outcome_market_idx on outcome (market_id);

-- The winning outcome must belong to the market it resolves. Resolving a
-- market with another market's outcome is not expressible.
alter table market drop constraint if exists market_resolved_outcome_fk;
alter table market add constraint market_resolved_outcome_fk
  foreign key (id, resolved_outcome_id) references outcome (market_id, id)
  deferrable initially deferred;

-- Every market needs at least two outcomes. Checked at COMMIT so that a
-- market and its outcomes can be inserted inside one transaction.
create or replace function assert_market_has_outcomes() returns trigger
language plpgsql as $$
declare
  target_market bigint;
  n integer;
begin
  if tg_table_name = 'market' then
    target_market := new.id;                      -- market triggers are INSERT/UPDATE only
  elsif tg_op = 'DELETE' then
    target_market := old.market_id;
  else
    target_market := new.market_id;
  end if;

  if not exists (select 1 from market where id = target_market) then
    return null;  -- market removed in this transaction; nothing to assert
  end if;

  select count(*) into n from outcome where market_id = target_market;
  if n < 2 then
    raise exception 'market % must have at least 2 outcomes (has %)', target_market, n
      using errcode = 'check_violation';
  end if;
  return null;
end $$;

drop trigger if exists market_outcome_count on market;
create constraint trigger market_outcome_count
  after insert or update on market
  deferrable initially deferred
  for each row execute function assert_market_has_outcomes();

drop trigger if exists outcome_count_guard on outcome;
create constraint trigger outcome_count_guard
  after insert or delete on outcome
  deferrable initially deferred
  for each row execute function assert_market_has_outcomes();

-- ---------------------------------------------------------------------
-- Accounts — one wallet per user, one escrow per market, one external
-- ---------------------------------------------------------------------
create table if not exists account (
  id         bigserial primary key,
  kind       account_kind not null,
  user_id    uuid   references app_user(id) on delete restrict,
  market_id  bigint references market(id)   on delete restrict,
  created_at timestamptz not null default now(),

  constraint account_shape check (
       (kind = 'user'     and user_id is not null and market_id is null)
    or (kind = 'market'   and user_id is null     and market_id is not null)
    or (kind = 'external' and user_id is null     and market_id is null)
  )
);
create unique index if not exists account_user_key     on account (user_id)   where kind = 'user';
create unique index if not exists account_market_key   on account (market_id) where kind = 'market';
-- Exactly one external account: it is the counterparty of the real world.
create unique index if not exists account_external_key on account ((true))    where kind = 'external';

-- Wallets and escrows are created automatically; the app never has to.
create or replace function create_user_account() returns trigger
language plpgsql as $$
begin
  insert into account (kind, user_id) values ('user', new.id);
  return new;
end $$;
drop trigger if exists app_user_account on app_user;
create trigger app_user_account after insert on app_user
  for each row execute function create_user_account();

create or replace function create_market_account() returns trigger
language plpgsql as $$
begin
  insert into account (kind, market_id) values ('market', new.id);
  return new;
end $$;
drop trigger if exists market_account on market;
create trigger market_account after insert on market
  for each row execute function create_market_account();

insert into account (kind) select 'external'
  where not exists (select 1 from account where kind = 'external');

-- ---------------------------------------------------------------------
-- The ledger — append-only, double-entry, integer centimes
-- ---------------------------------------------------------------------
create table if not exists ledger_transfer (
  id              bigserial primary key,
  kind            transfer_kind not null,
  -- Retrying any mutation with the same key is a no-op, never a double-spend.
  idempotency_key text not null unique check (length(idempotency_key) between 4 and 200),
  memo            text,
  market_id       bigint references market(id),
  created_at      timestamptz not null default now()
);
create index if not exists ledger_transfer_market_idx on ledger_transfer (market_id, kind);

create table if not exists ledger_entry (
  id          bigserial primary key,
  transfer_id bigint not null references ledger_transfer(id) on delete restrict,
  account_id  bigint not null references account(id)         on delete restrict,
  -- Signed centimes. Zero-amount legs carry no information and are rejected.
  amount      bigint not null check (amount <> 0),
  created_at  timestamptz not null default now()
);
create index if not exists ledger_entry_account_idx  on ledger_entry (account_id) include (amount);
create index if not exists ledger_entry_transfer_idx on ledger_entry (transfer_id);

-- Double-entry invariant: each transfer's legs sum to zero, and there are
-- at least two of them. Deferred, so both legs may be inserted separately.
create or replace function assert_transfer_balanced() returns trigger
language plpgsql as $$
declare
  legs integer;
  total bigint;
begin
  select count(*), coalesce(sum(amount), 0) into legs, total
    from ledger_entry where transfer_id = new.transfer_id;
  if legs < 2 then
    raise exception 'transfer % has % leg(s); double-entry needs at least 2',
      new.transfer_id, legs using errcode = 'check_violation';
  end if;
  if total <> 0 then
    raise exception 'transfer % does not balance (sum = %)', new.transfer_id, total
      using errcode = 'check_violation';
  end if;
  return null;
end $$;

drop trigger if exists ledger_entry_balanced on ledger_entry;
create constraint trigger ledger_entry_balanced
  after insert on ledger_entry
  deferrable initially deferred
  for each row execute function assert_transfer_balanced();

-- No user wallet may ever go negative. Checked immediately: the bet/withdraw
-- paths take a row lock on the wallet first, so this cannot race.
create or replace function assert_user_not_overdrawn() returns trigger
language plpgsql as $$
declare
  acct account%rowtype;
  bal bigint;
begin
  select * into acct from account where id = new.account_id;
  if acct.kind <> 'user' or new.amount >= 0 then
    return null;
  end if;
  select coalesce(sum(amount), 0) into bal from ledger_entry where account_id = acct.id;
  if bal < 0 then
    raise exception 'INSUFFICIENT_FUNDS'
      using errcode = 'check_violation',
            detail = format('wallet %s overdrawn (balance = %s)', acct.id, bal);
  end if;
  return null;
end $$;

drop trigger if exists ledger_entry_no_overdraft on ledger_entry;
create trigger ledger_entry_no_overdraft
  after insert on ledger_entry
  for each row execute function assert_user_not_overdrawn();

-- Append-only enforcement.
drop trigger if exists ledger_entry_immutable on ledger_entry;
create trigger ledger_entry_immutable before update or delete on ledger_entry
  for each statement execute function forbid_mutation();

drop trigger if exists ledger_transfer_immutable on ledger_transfer;
create trigger ledger_transfer_immutable before update or delete on ledger_transfer
  for each statement execute function forbid_mutation();

-- ---------------------------------------------------------------------
-- Bets — locked once placed
-- ---------------------------------------------------------------------
create table if not exists bet (
  id                 bigserial primary key,
  market_id          bigint not null,
  outcome_id         bigint not null,
  user_id            uuid   not null references app_user(id) on delete restrict,
  amount             bigint not null check (amount > 0),
  stake_transfer_id  bigint not null unique references ledger_transfer(id) on delete restrict,
  payout_transfer_id bigint          unique references ledger_transfer(id) on delete restrict,
  created_at         timestamptz not null default now(),
  -- The chosen outcome must belong to the market being bet on.
  foreign key (market_id, outcome_id) references outcome (market_id, id)
);
create index if not exists bet_market_idx  on bet (market_id, outcome_id);
create index if not exists bet_user_idx    on bet (user_id, created_at desc);

-- A stake is final: rows may be appended, never edited or removed. The one
-- permitted change is stamping payout_transfer_id at settlement.
create or replace function bet_only_payout_may_change() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'les paris sont definitifs: suppression interdite'
      using errcode = 'restrict_violation';
  end if;
  if new.id <> old.id or new.market_id <> old.market_id
     or new.outcome_id <> old.outcome_id or new.user_id <> old.user_id
     or new.amount <> old.amount or new.stake_transfer_id <> old.stake_transfer_id
     or new.created_at <> old.created_at then
    raise exception 'les paris sont definitifs: seul le paiement peut etre inscrit'
      using errcode = 'restrict_violation';
  end if;
  if old.payout_transfer_id is not null then
    raise exception 'pari % deja paye', old.id using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

drop trigger if exists bet_append_only on bet;
create trigger bet_append_only before update or delete on bet
  for each row execute function bet_only_payout_may_change();

-- Bets are only accepted on a market that is still open and before close.
create or replace function assert_market_open_for_bet() returns trigger
language plpgsql as $$
declare m market%rowtype;
begin
  select * into m from market where id = new.market_id for share;
  if m.status <> 'open' then
    raise exception 'MARKET_CLOSED' using errcode = 'check_violation';
  end if;
  if m.closes_at <= now() then
    raise exception 'MARKET_CLOSED' using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists bet_market_open on bet;
create trigger bet_market_open before insert on bet
  for each row execute function assert_market_open_for_bet();

-- ---------------------------------------------------------------------
-- External money movements (pulled deposits / requested withdrawals)
-- ---------------------------------------------------------------------
create table if not exists external_deposit (
  id           bigserial primary key,
  user_id      uuid not null references app_user(id) on delete restrict,
  amount       bigint not null check (amount > 0),
  -- Identifier from the upstream API. Unique, so re-polling never re-credits.
  source_ref   text not null unique,
  transfer_id  bigint not null unique references ledger_transfer(id),
  pulled_at    timestamptz not null default now()
);

create table if not exists withdrawal (
  id           bigserial primary key,
  user_id      uuid not null references app_user(id) on delete restrict,
  amount       bigint not null check (amount > 0),
  transfer_id  bigint not null unique references ledger_transfer(id),
  created_at   timestamptz not null default now()
);

commit;
