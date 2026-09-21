-- Fichier en UTF-8. Sans cette ligne, psql sous Windows lit les accents
-- selon la page de code de la console et les enregistre corrompus.
set client_encoding = 'UTF8';

-- =====================================================================
-- mp2ifsm.com — portail de classe : fiches, documents, échéances.
--
-- S'applique par-dessus db/schema.sql (comptes + marché). Mêmes règles :
-- l'état vit en base, le serveur seul l'écrit, et les états invalides
-- sont rendus inexprimables par des contraintes.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema-portal.sql
-- =====================================================================

begin;

-- Matières de la prépa. Un enum : une faute de frappe est impossible.
do $$ begin
  create type matiere as enum ('Maths','Physique','Chimie','SI','Français','Anglais');
exception when duplicate_object then null; end $$;

-- États FSRS (identiques à ts-fsrs : New/Learning/Review/Relearning).
do $$ begin
  create type fsrs_state as enum ('New','Learning','Review','Relearning');
exception when duplicate_object then null; end $$;

do $$ begin
  create type echeance_kind as enum ('DS','DM','Colle','TIPE','Oral','Projet','Autre');
exception when duplicate_object then null; end $$;

-- Partage opt-in des statistiques de révision (heatmap de classe).
alter table app_user add column if not exists partage_stats boolean not null default false;

-- ---------------------------------------------------------------------
-- Fiches — les paquets appartiennent à la classe
-- ---------------------------------------------------------------------
create table if not exists deck (
  id          bigserial primary key,
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  titre       text not null check (length(btrim(titre)) between 2 and 120),
  matiere     matiere not null,
  chapitre    text not null check (length(btrim(chapitre)) between 1 and 120),
  description text,
  created_by  uuid not null references app_user(id),
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists deck_matiere_idx on deck (matiere, chapitre);

create table if not exists card (
  id         bigserial primary key,
  deck_id    bigint not null references deck(id) on delete cascade,
  -- Recto/verso en texte : LaTeX ($...$, $$...$$) et images
  -- ![](/api/fiches/image/<id>) sont rendus à l'affichage.
  recto      text not null check (length(btrim(recto)) between 1 and 8000),
  verso      text not null check (length(btrim(verso)) between 1 and 8000),
  author_id  uuid not null references app_user(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Suppression douce : l'historique et les états restent traçables.
  deleted_at timestamptz,
  deleted_by uuid references app_user(id),
  -- Identifiant Anki d'origine, pour que ré-importer un .apkg mette à
  -- jour les cartes au lieu de les dupliquer.
  anki_guid  text,
  constraint card_deletion_coherent check ((deleted_at is null) = (deleted_by is null))
);
create index if not exists card_deck_idx on card (deck_id) where deleted_at is null;
create index if not exists card_author_idx on card (author_id);
create unique index if not exists card_anki_guid_key on card (deck_id, anki_guid)
  where anki_guid is not null;

-- Historique d'édition : append-only, une ligne par version.
-- Une carte fausse peut donc être retracée et corrigée, jamais
-- silencieusement réécrite.
create table if not exists card_revision (
  id         bigserial primary key,
  card_id    bigint not null references card(id) on delete cascade,
  recto      text not null,
  verso      text not null,
  edited_by  uuid not null references app_user(id),
  edited_at  timestamptz not null default now(),
  motif      text
);
create index if not exists card_revision_card_idx on card_revision (card_id, edited_at desc);

drop trigger if exists card_revision_immutable on card_revision;
create trigger card_revision_immutable before update or delete on card_revision
  for each statement execute function forbid_mutation();

-- Toute création ou modification de carte écrit sa révision.
create or replace function enregistrer_revision_carte() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and new.recto is not distinct from old.recto
     and new.verso is not distinct from old.verso then
    return new;   -- rien de substantiel n'a changé
  end if;
  insert into card_revision (card_id, recto, verso, edited_by)
    values (new.id, new.recto, new.verso, new.author_id);
  return new;
end $$;

drop trigger if exists card_revision_auto on card;
create trigger card_revision_auto after insert on card
  for each row execute function enregistrer_revision_carte();

create table if not exists card_report (
  id          bigserial primary key,
  card_id     bigint not null references card(id) on delete cascade,
  reported_by uuid not null references app_user(id),
  motif       text not null check (length(btrim(motif)) between 3 and 500),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references app_user(id),
  constraint report_resolution_coherent check ((resolved_at is null) = (resolved_by is null)),
  -- Un même membre ne signale une carte qu'une fois tant que c'est ouvert.
  -- Index partiel : une contrainte UNIQUE portant sur resolved_at ne
  -- contraindrait rien, deux NULL n'étant pas égaux.
  x_placeholder boolean
);
alter table card_report drop column if exists x_placeholder;
-- Héritage d'une première version : cette contrainte ne contraignait rien.
alter table card_report drop constraint if exists card_report_card_id_reported_by_resolved_at_key;
create unique index if not exists card_report_ouvert_key
  on card_report (card_id, reported_by) where resolved_at is null;
create index if not exists card_report_ouverts_idx on card_report (created_at desc)
  where resolved_at is null;

-- ---------------------------------------------------------------------
-- État d'apprentissage — appartient à CHAQUE utilisateur
-- ---------------------------------------------------------------------
-- Les paquets sont communs, la planification est personnelle : la clé
-- primaire (user_id, card_id) rend un état partagé inexprimable.
create table if not exists card_state (
  user_id        uuid   not null references app_user(id) on delete cascade,
  card_id        bigint not null references card(id)     on delete cascade,
  state          fsrs_state not null default 'New',
  due            timestamptz not null,
  stability      double precision not null default 0 check (stability >= 0),
  difficulty     double precision not null default 0 check (difficulty >= 0 and difficulty <= 10),
  elapsed_days   integer not null default 0 check (elapsed_days >= 0),
  scheduled_days integer not null default 0 check (scheduled_days >= 0),
  learning_steps integer not null default 0 check (learning_steps >= 0),
  reps           integer not null default 0 check (reps >= 0),
  lapses         integer not null default 0 check (lapses >= 0),
  last_review    timestamptz,
  primary key (user_id, card_id),
  -- Une carte jamais vue n'a pas de dernière révision, et inversement.
  constraint state_review_coherent check ((state = 'New') = (last_review is null))
);
create index if not exists card_state_du_idx on card_state (user_id, due);

-- Journal de révision : sert aux statistiques de rétention et à la
-- heatmap. Append-only.
create table if not exists review_log (
  id                bigserial primary key,
  user_id           uuid   not null references app_user(id) on delete cascade,
  card_id           bigint not null references card(id)     on delete cascade,
  rating            smallint not null check (rating between 1 and 4),
  state             fsrs_state not null,
  due               timestamptz not null,
  stability         double precision not null,
  difficulty        double precision not null,
  elapsed_days      integer not null,
  last_elapsed_days integer not null,
  scheduled_days    integer not null,
  reviewed_at       timestamptz not null default now(),
  duree_ms          integer check (duree_ms is null or duree_ms >= 0)
);
create index if not exists review_log_user_idx on review_log (user_id, reviewed_at desc);
create index if not exists review_log_card_idx on review_log (card_id, reviewed_at desc);

drop trigger if exists review_log_immutable on review_log;
create trigger review_log_immutable before update or delete on review_log
  for each statement execute function forbid_mutation();

-- Images collées ou téléversées dans une carte. Le fichier vit sur le
-- SSD ; seules les métadonnées sont ici.
create table if not exists card_image (
  id           bigserial primary key,
  storage_name text not null unique,
  mime         text not null check (mime in ('image/png','image/jpeg','image/gif','image/webp')),
  taille       bigint not null check (taille > 0),
  uploaded_by  uuid not null references app_user(id),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Documents — fichiers sur le SSD, métadonnées ici
-- ---------------------------------------------------------------------
create table if not exists document (
  id            bigserial primary key,
  -- Nom aléatoire sur disque. Jamais dérivé du nom fourni par
  -- l'utilisateur : aucune traversée de chemin n'est possible.
  storage_name  text not null unique check (storage_name ~ '^[a-f0-9]{32}$'),
  original_name text not null check (length(btrim(original_name)) between 1 and 255),
  mime          text not null,
  taille        bigint not null check (taille > 0),
  sha256        bytea,
  matiere       matiere,
  chapitre      text check (chapitre is null or length(btrim(chapitre)) between 1 and 120),
  tags          text[] not null default '{}',
  uploaded_by   uuid not null references app_user(id),
  created_at    timestamptz not null default now(),
  -- Suppression douce : 30 jours avant effacement réel du fichier.
  deleted_at    timestamptz,
  deleted_by    uuid references app_user(id),
  purge_after   timestamptz,
  constraint document_deletion_coherent check (
    (deleted_at is null) = (deleted_by is null)
    and (deleted_at is null) = (purge_after is null)
  ),
  -- Recherche plein texte sur le nom, les tags et le chapitre.
  -- Entretenue par trigger et non par colonne générée : array_to_string
  -- est STABLE, pas IMMUTABLE, donc interdite dans une expression
  -- « generated always as ».
  recherche tsvector
);

create or replace function document_maj_recherche() returns trigger
language plpgsql as $$
begin
  new.recherche := to_tsvector('french',
    coalesce(new.original_name, '') || ' ' ||
    coalesce(array_to_string(new.tags, ' '), '') || ' ' ||
    coalesce(new.chapitre, ''));
  return new;
end $$;

drop trigger if exists document_recherche_maj on document;
create trigger document_recherche_maj before insert or update
  of original_name, tags, chapitre on document
  for each row execute function document_maj_recherche();
create index if not exists document_recherche_idx on document using gin (recherche);
create index if not exists document_tags_idx      on document using gin (tags);
create index if not exists document_classement_idx on document (matiere, chapitre)
  where deleted_at is null;
create index if not exists document_recents_idx   on document (created_at desc)
  where deleted_at is null;
create index if not exists document_purge_idx     on document (purge_after)
  where deleted_at is not null;

-- ---------------------------------------------------------------------
-- Échéances saisies par la classe
-- ---------------------------------------------------------------------
create table if not exists echeance (
  id         bigserial primary key,
  titre      text not null check (length(btrim(titre)) between 3 and 120),
  kind       echeance_kind not null default 'Autre',
  matiere    matiere,
  due_at     timestamptz not null,
  details    text,
  created_by uuid not null references app_user(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists echeance_a_venir_idx on echeance (due_at)
  where deleted_at is null;

commit;
