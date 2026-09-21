-- Fichier en UTF-8. Sans cette ligne, psql sous Windows lit les accents
-- selon la page de code de la console et les enregistre corrompus.
set client_encoding = 'UTF8';

-- =====================================================================
-- mp2ifsm.com — money RPCs.
--
-- Every mutation that touches money lives here, in one PostgreSQL
-- function, so it is atomic by construction. The web layer may only
-- call these; it never composes its own INSERTs into the ledger and it
-- never computes a balance itself.
--
-- Error codes raised here are stable identifiers (MARKET_CLOSED,
-- INSUFFICIENT_FUNDS, ...) which the app maps to French messages.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- The one and only way to read money. There is no balance column.
create or replace function account_balance(p_account_id bigint)
returns bigint language sql stable as $$
  select coalesce(sum(amount), 0)::bigint
    from ledger_entry where account_id = p_account_id;
$$;

create or replace function wallet_id(p_user_id uuid)
returns bigint language sql stable as $$
  select id from account where kind = 'user' and user_id = p_user_id;
$$;

create or replace function wallet_balance(p_user_id uuid)
returns bigint language sql stable as $$
  select account_balance(wallet_id(p_user_id));
$$;

create or replace function external_account_id()
returns bigint language sql stable as $$
  select id from account where kind = 'external';
$$;

create or replace function market_account_id(p_market_id bigint)
returns bigint language sql stable as $$
  select id from account where kind = 'market' and market_id = p_market_id;
$$;

-- Post one balanced double-entry movement. Debit and credit are written
-- together, so an unbalanced transfer cannot be produced by this path.
create or replace function post_transfer(
  p_kind        transfer_kind,
  p_idem        text,
  p_from        bigint,
  p_to          bigint,
  p_amount      bigint,
  p_memo        text default null,
  p_market_id   bigint default null
) returns bigint language plpgsql as $$
declare t_id bigint;
begin
  if p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'check_violation';
  end if;
  if p_from = p_to then
    raise exception 'INVALID_TRANSFER' using errcode = 'check_violation';
  end if;

  insert into ledger_transfer (kind, idempotency_key, memo, market_id)
    values (p_kind, p_idem, p_memo, p_market_id)
    returning id into t_id;

  insert into ledger_entry (transfer_id, account_id, amount) values
    (t_id, p_from, -p_amount),
    (t_id, p_to,    p_amount);

  return t_id;
end $$;

-- ---------------------------------------------------------------------
-- Deposits — the only way centimes enter the system
-- ---------------------------------------------------------------------
-- p_source_ref is the upstream API's identifier for the payment. It is
-- UNIQUE, so replaying the whole upstream feed credits nothing twice.
create or replace function record_deposit(
  p_user_id    uuid,
  p_amount     bigint,
  p_source_ref text
) returns bigint language plpgsql as $$
declare
  t_id     bigint;
  existing bigint;
begin
  select id into existing from external_deposit where source_ref = p_source_ref;
  if existing is not null then
    return existing;  -- already pulled; idempotent no-op
  end if;

  t_id := post_transfer(
    'deposit', 'deposit:' || p_source_ref,
    external_account_id(), wallet_id(p_user_id), p_amount,
    'Depot ' || p_source_ref);

  insert into external_deposit (user_id, amount, source_ref, transfer_id)
    values (p_user_id, p_amount, p_source_ref, t_id)
    returning id into existing;
  return existing;
exception when unique_violation then
  -- Concurrent pull of the same payment: the other transaction won.
  select id into existing from external_deposit where source_ref = p_source_ref;
  return existing;
end $$;

-- ---------------------------------------------------------------------
-- Withdrawals — the only way centimes leave the system
-- ---------------------------------------------------------------------
create or replace function request_withdrawal(
  p_user_id uuid,
  p_amount  bigint,
  p_idem    text
) returns bigint language plpgsql as $$
declare
  w_id   bigint;
  acct   bigint;
  bal    bigint;
begin
  select w.id into w_id from withdrawal w
    join ledger_transfer t on t.id = w.transfer_id
   where t.idempotency_key = p_idem;
  if w_id is not null then
    return w_id;  -- retry of a withdrawal we already made
  end if;

  acct := wallet_id(p_user_id);
  -- Serialise every debit of this wallet behind one row lock, so two
  -- concurrent withdrawals cannot both observe a sufficient balance.
  perform 1 from account where id = acct for update;

  bal := account_balance(acct);
  if bal < p_amount then
    raise exception 'INSUFFICIENT_FUNDS' using errcode = 'check_violation';
  end if;

  insert into withdrawal (user_id, amount, transfer_id)
    values (p_user_id, p_amount,
            post_transfer('withdrawal', p_idem, acct, external_account_id(),
                          p_amount, 'Retrait'))
    returning id into w_id;
  return w_id;
end $$;

-- ---------------------------------------------------------------------
-- Placing a bet — stake moves wallet -> market escrow, and is locked
-- ---------------------------------------------------------------------
create or replace function place_bet(
  p_user_id    uuid,
  p_outcome_id bigint,
  p_amount     bigint,
  p_idem       text
) returns bigint language plpgsql as $$
declare
  b_id      bigint;
  acct      bigint;
  bal       bigint;
  m_id      bigint;
  m         market%rowtype;
begin
  select b.id into b_id from bet b
    join ledger_transfer t on t.id = b.stake_transfer_id
   where t.idempotency_key = p_idem;
  if b_id is not null then
    return b_id;  -- retry of a bet we already placed
  end if;

  select market_id into m_id from outcome where id = p_outcome_id;
  if m_id is null then
    raise exception 'OUTCOME_NOT_FOUND' using errcode = 'no_data_found';
  end if;

  select * into m from market where id = m_id for share;
  if m.status <> 'open' or m.closes_at <= now() then
    raise exception 'MARKET_CLOSED' using errcode = 'check_violation';
  end if;

  acct := wallet_id(p_user_id);
  perform 1 from account where id = acct for update;

  bal := account_balance(acct);
  if bal < p_amount then
    raise exception 'INSUFFICIENT_FUNDS' using errcode = 'check_violation';
  end if;

  insert into bet (market_id, outcome_id, user_id, amount, stake_transfer_id)
    values (m_id, p_outcome_id, p_user_id, p_amount,
            post_transfer('bet', p_idem, acct, market_account_id(m_id),
                          p_amount, 'Mise', m_id))
    returning id into b_id;
  return b_id;
end $$;

-- ---------------------------------------------------------------------
-- Resolution — pays out exactly the pool, never more, never less
-- ---------------------------------------------------------------------
-- payout_i = floor(stake_i * pool / winning_stake).
-- Integer division loses centimes; the remainder is handed to the last
-- settled winner so that sum(payouts) == pool exactly. The escrow
-- account is asserted to land on zero, which is the conservation proof:
-- if it does not, the whole transaction rolls back.
create or replace function settle_market(
  p_market_id  bigint,
  p_outcome_id bigint,
  p_admin_id   uuid
) returns bigint language plpgsql as $$
declare
  m             market%rowtype;
  escrow        bigint;
  pool          bigint;
  winning_stake bigint;
  paid          bigint := 0;
  remainder     bigint;
  payout        bigint;
  winners       bigint;
  seen          bigint := 0;
  r             record;
  residual      bigint;
begin
  -- Lock the market for the whole settlement.
  select * into m from market where id = p_market_id for update;
  if not found then
    raise exception 'MARKET_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if m.status in ('resolved', 'cancelled') then
    raise exception 'MARKET_ALREADY_RESOLVED' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from outcome
                  where id = p_outcome_id and market_id = p_market_id) then
    raise exception 'OUTCOME_NOT_IN_MARKET' using errcode = 'check_violation';
  end if;

  escrow := market_account_id(p_market_id);

  select coalesce(sum(amount), 0) into pool
    from bet where market_id = p_market_id;
  select coalesce(sum(amount), 0) into winning_stake
    from bet where market_id = p_market_id and outcome_id = p_outcome_id;
  select count(*) into winners
    from bet where market_id = p_market_id and outcome_id = p_outcome_id;

  if pool > 0 and winning_stake = 0 then
    -- Nobody backed the winning outcome: the pool cannot be divided, so
    -- every stake is returned. Still conserved, still no minting.
    for r in select * from bet where market_id = p_market_id order by id loop
      update bet set payout_transfer_id = post_transfer(
        'refund', 'refund:' || r.id, escrow, wallet_id(r.user_id), r.amount,
        'Remboursement (aucun gagnant)', p_market_id)
      where id = r.id;
    end loop;

  elsif pool > 0 then
    -- First pass: floor division for every winner.
    for r in select * from bet
              where market_id = p_market_id and outcome_id = p_outcome_id
              order by id loop
      seen := seen + 1;
      payout := floor((r.amount::numeric * pool::numeric)
                      / winning_stake::numeric)::bigint;

      if seen = winners then
        -- Last settled winner absorbs the integer remainder, so the pool
        -- is distributed to the centime.
        remainder := pool - paid - payout;
        payout := payout + remainder;
      end if;

      paid := paid + payout;

      update bet set payout_transfer_id = post_transfer(
        'payout', 'payout:' || r.id, escrow, wallet_id(r.user_id), payout,
        'Gain', p_market_id)
      where id = r.id;
    end loop;

    if paid <> pool then
      raise exception 'SETTLEMENT_NOT_CONSERVED: paid % of pool %', paid, pool
        using errcode = 'check_violation';
    end if;
  end if;

  update market
     set status = 'resolved', resolved_outcome_id = p_outcome_id,
         resolved_at = now(), resolved_by = p_admin_id
   where id = p_market_id;

  -- Conservation proof: the escrow took in the pool and paid out the
  -- pool, so it must be empty. Anything else aborts the settlement.
  residual := account_balance(escrow);
  if residual <> 0 then
    raise exception 'ESCROW_NOT_EMPTY: market % left % centimes', p_market_id, residual
      using errcode = 'check_violation';
  end if;

  return pool;
end $$;

-- Cancelling refunds every stake at face value.
create or replace function cancel_market(p_market_id bigint, p_admin_id uuid)
returns bigint language plpgsql as $$
declare
  m        market%rowtype;
  escrow   bigint;
  r        record;
  refunded bigint := 0;
  residual bigint;
begin
  select * into m from market where id = p_market_id for update;
  if not found then
    raise exception 'MARKET_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if m.status in ('resolved', 'cancelled') then
    raise exception 'MARKET_ALREADY_RESOLVED' using errcode = 'check_violation';
  end if;

  escrow := market_account_id(p_market_id);

  for r in select * from bet where market_id = p_market_id order by id loop
    update bet set payout_transfer_id = post_transfer(
      'refund', 'refund:' || r.id, escrow, wallet_id(r.user_id), r.amount,
      'Marche annule', p_market_id)
    where id = r.id;
    refunded := refunded + r.amount;
  end loop;

  update market set status = 'cancelled' where id = p_market_id;

  residual := account_balance(escrow);
  if residual <> 0 then
    raise exception 'ESCROW_NOT_EMPTY: market % left % centimes', p_market_id, residual
      using errcode = 'check_violation';
  end if;

  return refunded;
end $$;

commit;
