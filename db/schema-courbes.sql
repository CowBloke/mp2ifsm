-- Curve Fight : classements du jeu de courbes (migration additive).
--
-- Les salons et les parties en cours vivent en mémoire dans le processus
-- du site ; seules les statistiques sont gardées ici. Les bots n'y
-- figurent jamais : on n'enregistre que les parties à deux humains au
-- moins et les tirs d'un humain qui éliminent un humain.
--
-- Rejouée sans risque : le site l'applique lui-même au premier
-- enregistrement (src/lib/courbes/classement.ts).
begin;

create table if not exists courbes_partie (
  id        bigserial primary key,
  cree_le   timestamptz not null default now(),
  mode      text not null check (mode in ('classique', 'brouillard')),
  tir       text not null check (tir in ('fonction', 'equadiff')),
  joueurs   integer not null check (joueurs >= 2),
  manches   integer not null check (manches >= 1)
);

create table if not exists courbes_resultat (
  partie_id        bigint not null references courbes_partie(id) on delete cascade,
  user_id          uuid not null references app_user(id) on delete cascade,
  rang             integer not null check (rang >= 1),
  points           integer not null,
  eliminations     integer not null,
  manches_gagnees  integer not null,
  primary key (partie_id, user_id)
);
create index if not exists courbes_resultat_user_idx on courbes_resultat (user_id);

-- Un tir victorieux : l'expression saisie, telle quelle et sous forme
-- canonique (sans espaces, minuscules) pour regrouper les fonctions fétiches.
create table if not exists courbes_tir (
  id          bigserial primary key,
  user_id     uuid not null references app_user(id) on delete cascade,
  cree_le     timestamptz not null default now(),
  expression  text not null check (char_length(expression) between 1 and 120),
  canonique   text not null,
  mode        text not null check (mode in ('classique', 'brouillard')),
  tir         text not null check (tir in ('fonction', 'equadiff')),
  victimes    integer not null check (victimes >= 1),
  -- Longueur d'arc parcourue jusqu'à la dernière victime.
  longueur    real not null check (longueur >= 0)
);
create index if not exists courbes_tir_palmares_idx on courbes_tir (victimes desc, longueur desc);
create index if not exists courbes_tir_canonique_idx on courbes_tir (canonique);

commit;
