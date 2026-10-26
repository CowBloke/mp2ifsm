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
