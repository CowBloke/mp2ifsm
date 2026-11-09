-- Toilet! : classement des passages aux toilettes du bas (migration additive).
--
-- Rubrique cachée : elle n'existe pour un membre qu'après ouverture du
-- lien secret /toilet/rejoindre/<code>, qui l'inscrit dans toilet_membre.
-- Les photos de preuve vivent dans STORAGE_ROOT/toilet-photos (noms
-- aléatoires, 600) et comptent dans le quota commun (src/lib/uploads.ts).
begin;

-- Une seule ligne : le code du lien d'activation, tiré au hasard au
-- premier passage de la migration et jamais réécrit ensuite.
create table if not exists toilet_config (
  id               boolean primary key default true check (id),
  code_invitation  text not null check (code_invitation ~ '^[a-f0-9]{32}$')
);
insert into toilet_config (code_invitation)
  values (replace(gen_random_uuid()::text, '-', ''))
  on conflict do nothing;

create table if not exists toilet_membre (
  user_id    uuid primary key references app_user(id) on delete cascade,
  active_le  timestamptz not null default now()
);

create table if not exists toilet_passage (
  id            bigserial primary key,
  user_id       uuid not null references toilet_membre(user_id) on delete cascade,
  cree_le       timestamptz not null default now(),
  -- Photo de preuve de propreté, facultative : les trois colonnes
  -- sont toutes nulles ou toutes renseignées.
  storage_name  text unique check (storage_name ~ '^[a-f0-9]{32}$'),
  mime          text,
  taille        bigint check (taille > 0),
  check ((storage_name is null) = (mime is null) and (mime is null) = (taille is null))
);
create index if not exists toilet_passage_user_idx on toilet_passage (user_id, cree_le desc);
create index if not exists toilet_passage_fil_idx  on toilet_passage (cree_le desc);

commit;
