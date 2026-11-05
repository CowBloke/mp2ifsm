set client_encoding = 'UTF8';

-- =====================================================================
-- mp2ifsm.com — dossiers pour ranger les documents et les paquets.
--
-- S'applique après db/schema-etudes.sql. Rejouée à chaque déploiement :
-- tout est idempotent et additif (l'ancien build ignore les nouvelles
-- colonnes, un retour arrière reste possible).
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema-dossiers.sql
-- =====================================================================

begin;

-- Une seule table pour les deux arborescences : `kind` les sépare, un
-- dossier de documents ne contient jamais de paquet et inversement.
-- La profondeur maximale (4) est vérifiée par le serveur.
create table if not exists dossier (
  id         bigserial primary key,
  kind       text not null check (kind in ('document','deck')),
  parent_id  bigint references dossier(id),
  -- Dossier racine : la matière est choisie. Sous-dossier : toujours
  -- celle du parent (le serveur la propage).
  subject_id smallint references subject(id),
  nom        text not null check (length(btrim(nom)) between 1 and 60),
  created_by uuid not null references app_user(id),
  created_at timestamptz not null default now(),
  constraint dossier_pas_son_propre_parent check (parent_id is distinct from id)
);
-- Deux dossiers frères ne portent pas le même nom (à la casse près).
create unique index if not exists dossier_nom_key
  on dossier (kind, coalesce(parent_id, 0), coalesce(subject_id, 0), lower(btrim(nom)));
create index if not exists dossier_parent_idx on dossier (parent_id);

-- Supprimer un dossier ne supprime jamais son contenu : le serveur
-- remonte d'abord le contenu d'un cran. set null est le filet de sécurité.
alter table deck     add column if not exists folder_id bigint references dossier(id) on delete set null;
alter table document add column if not exists folder_id bigint references dossier(id) on delete set null;
create index if not exists deck_folder_idx     on deck (folder_id);
create index if not exists document_folder_idx on document (folder_id) where deleted_at is null;

-- Une seule fois : range ce qui existait déjà. Rejouer ce bloc
-- ressusciterait des dossiers que la classe a depuis déplacés ou supprimés.
do $$
declare
  g record;
  racine bigint;
begin
  if exists (select 1 from migration_unique where nom = 'dossiers_initiaux') then
    return;
  end if;

  -- Paquets : un dossier par chapitre quand plusieurs paquets le partagent
  -- (« Chapitre 1 » : le cours de l'un, le paquet MP2I de l'autre).
  -- Un paquet seul reste directement dans sa matière.
  for g in
    select subject_id, lower(btrim(chapitre)) as cle, min(btrim(chapitre)) as chapitre,
           (array_agg(created_by order by id))[1] as auteur
      from deck
     where archived_at is null
     group by subject_id, lower(btrim(chapitre))
    having count(*) >= 2
  loop
    insert into dossier (kind, subject_id, nom, created_by)
      values ('deck', g.subject_id,
              left(case when g.chapitre ~ '^[0-9]+$' then 'Chapitre ' || g.chapitre
                        else g.chapitre end, 60),
              g.auteur)
      on conflict do nothing;
    update deck d
       set folder_id = (select f.id from dossier f
                         where f.kind = 'deck' and f.parent_id is null
                           and f.subject_id is not distinct from g.subject_id
                           and lower(btrim(f.nom)) = lower(btrim(
                                 case when g.chapitre ~ '^[0-9]+$' then 'Chapitre ' || g.chapitre
                                      else g.chapitre end)))
     where d.archived_at is null and d.subject_id is not distinct from g.subject_id
       and lower(btrim(d.chapitre)) = g.cle;
  end loop;

  -- Documents : un dossier par matière, un sous-dossier par chapitre.
  -- Sans matière, un document reste à la racine.
  for g in
    select d.subject_id, s.nom as matiere, (array_agg(d.uploaded_by order by d.id))[1] as auteur
      from document d join subject s on s.id = d.subject_id
     group by d.subject_id, s.nom
  loop
    insert into dossier (kind, subject_id, nom, created_by)
      values ('document', g.subject_id, left(g.matiere, 60), g.auteur)
      on conflict do nothing
      returning id into racine;
    if racine is null then
      select id into racine from dossier
       where kind = 'document' and parent_id is null and subject_id = g.subject_id
         and lower(btrim(nom)) = lower(btrim(left(g.matiere, 60)));
    end if;
    update document set folder_id = racine
     where subject_id = g.subject_id and chapitre is null;
  end loop;

  for g in
    select d.subject_id, lower(btrim(d.chapitre)) as cle, min(btrim(d.chapitre)) as chapitre,
           (array_agg(d.uploaded_by order by d.id))[1] as auteur
      from document d
     where d.subject_id is not null and d.chapitre is not null
     group by d.subject_id, lower(btrim(d.chapitre))
  loop
    select id into racine from dossier
     where kind = 'document' and parent_id is null and subject_id = g.subject_id
     order by id limit 1;
    insert into dossier (kind, parent_id, subject_id, nom, created_by)
      values ('document', racine, g.subject_id, left(g.chapitre, 60), g.auteur)
      on conflict do nothing;
    update document d
       set folder_id = (select f.id from dossier f
                         where f.kind = 'document' and f.parent_id = racine
                           and lower(btrim(f.nom)) = lower(btrim(left(g.chapitre, 60))))
     where d.subject_id = g.subject_id and lower(btrim(d.chapitre)) = g.cle;
  end loop;

  insert into migration_unique (nom) values ('dossiers_initiaux');
end $$;

commit;

-- ---------------------------------------------------------------------
-- J'aime sur les paquets et message d'accueil (3 novembre 2026).
-- Ajouté ici plutôt que dans un nouveau fichier : le script de build
-- installé ne rejoue que la liste de migrations connue.
-- ---------------------------------------------------------------------
begin;

create table if not exists deck_like (
  user_id    uuid   not null references app_user(id) on delete cascade,
  deck_id    bigint not null references deck(id)     on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, deck_id)
);
create index if not exists deck_like_deck_idx on deck_like (deck_id);
create index if not exists deck_created_idx on deck (created_at desc) where archived_at is null;

-- Message d'accueil : une seule ligne (id = 1), modifiable par un admin.
create table if not exists message_accueil (
  id         smallint primary key default 1 check (id = 1),
  texte      text not null default '' check (length(texte) <= 1000),
  updated_by uuid references app_user(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Notifications (bloc du 4 novembre 2026) : web push, « flash du jour ».
-- ---------------------------------------------------------------------

-- Clés VAPID du serveur, créées au premier besoin (une seule ligne).
create table if not exists push_cle (
  id         smallint primary key default 1 check (id = 1),
  publique   text not null,
  privee     text not null,
  created_at timestamptz not null default now()
);

-- Un abonnement par appareil (navigateur ou app installée).
create table if not exists push_abonnement (
  id          bigserial primary key,
  user_id     uuid not null references app_user(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  appareil    text,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz,
  echecs      smallint not null default 0
);
create index if not exists push_abonnement_user_idx on push_abonnement (user_id);

-- Préférences par membre. flash_repondu : la question du flash du jour
-- a été posée (oui ou non), la fenêtre ne revient plus.
create table if not exists notif_pref (
  user_id       uuid primary key references app_user(id) on delete cascade,
  flash         boolean not null default false,
  flash_repondu boolean not null default false,
  devoirs       boolean not null default true,
  messages      boolean not null default true,
  updated_at    timestamptz not null default now()
);

-- Rappel quotidien des fiches : heure choisie par le membre (Paris).
alter table notif_pref add column if not exists flash_heure smallint not null default 18
  check (flash_heure between 7 and 22);

-- Envois déjà faits (un par membre, genre et jour) : rejouer ne double rien.
create table if not exists notif_envoi (
  user_id  uuid not null references app_user(id) on delete cascade,
  genre    text not null check (genre in ('flash','devoirs','message')),
  cle      text not null,
  envoye_at timestamptz not null default now(),
  primary key (user_id, genre, cle)
);

commit;

-- ---------------------------------------------------------------------
-- Vidéos éducatives (bloc du 5 novembre 2026) : enregistrées dans l'app,
-- montées dans le navigateur, rendues par ffmpeg sur le serveur.
-- Fichiers dans STORAGE_ROOT/videos (noms aléatoires, 600).
-- ---------------------------------------------------------------------
begin;

create table if not exists video (
  id           bigserial primary key,
  auteur       uuid not null references app_user(id) on delete cascade,
  titre        text not null check (length(btrim(titre)) between 1 and 120),
  description  text not null default '' check (length(description) <= 1000),
  subject_id   smallint references subject(id) on delete set null,
  statut       text not null default 'traitement' check (statut in ('traitement','pret','echec')),
  -- Clips bruts en attente de rendu, supprimés ensuite.
  sources      text[] not null default '{}',
  montage      jsonb not null,
  storage_name text check (storage_name ~ '^[a-f0-9]{32}$'),
  poster_name  text check (poster_name ~ '^[a-f0-9]{32}$'),
  duree_ms     integer,
  -- Octets occupés (sources pendant le rendu, puis vidéo + couverture) : compte dans le quota.
  taille       bigint not null default 0,
  tentatives   smallint not null default 0,
  erreur       text,
  created_at   timestamptz not null default now(),
  pret_at      timestamptz
);
create index if not exists video_fil_idx on video (created_at desc) where statut = 'pret';
create index if not exists video_auteur_idx on video (auteur);

create table if not exists video_like (
  user_id    uuid   not null references app_user(id) on delete cascade,
  video_id   bigint not null references video(id)    on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, video_id)
);
create index if not exists video_like_video_idx on video_like (video_id);

create table if not exists video_vue (
  user_id    uuid   not null references app_user(id) on delete cascade,
  video_id   bigint not null references video(id)    on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, video_id)
);
create index if not exists video_vue_video_idx on video_vue (video_id);

create table if not exists video_commentaire (
  id         bigserial primary key,
  video_id   bigint not null references video(id)    on delete cascade,
  auteur     uuid   not null references app_user(id) on delete cascade,
  texte      text   not null check (length(btrim(texte)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists video_commentaire_video_idx on video_commentaire (video_id, created_at);

commit;
