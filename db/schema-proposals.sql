begin;
create table if not exists market_proposal (
 id bigserial primary key,
 user_id uuid not null references app_user(id),
 question text not null check (length(question) between 8 and 200),
 description text not null default '',
 closes_at timestamptz not null,
 issues text[] not null check (cardinality(issues) between 2 and 10),
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 reviewed_by uuid references app_user(id),
 reviewed_at timestamptz,
 review_note text not null default '',
 market_id bigint unique references market(id),
 created_at timestamptz not null default now(),
 check ((status = 'approved') = (market_id is not null)),
 check ((status = 'pending') = (reviewed_at is null)),
 check ((status = 'pending') = (reviewed_by is null))
);
create index if not exists market_proposal_queue on market_proposal(status,created_at);
create index if not exists market_proposal_user on market_proposal(user_id,created_at);
commit;
