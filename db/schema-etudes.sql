-- Fichier en UTF-8. Sans cette ligne, psql sous Windows lit les accents
-- selon la page de code de la console et les enregistre corrompus.
set client_encoding = 'UTF8';

-- =====================================================================
-- mp2ifsm.com — matières personnalisables, abonnements aux paquets,
-- retours des membres, groupe de colles.
--
-- S'applique après db/schema-portal.sql et db/schema-proposals.sql.
-- Rejouée à chaque déploiement : tout est idempotent et additif. La
-- colonne enum `matiere` reste en place et synchronisée, pour que le
-- build précédent continue de fonctionner en cas de retour arrière.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema-etudes.sql
-- =====================================================================

begin;

-- Migrations de données à n'exécuter qu'une fois (les rejouer
-- écraserait des choix faits depuis par les membres).
create table if not exists migration_unique (
  nom        text primary key,
  applied_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Matières
-- ---------------------------------------------------------------------
-- La couleur est une clé de la palette fixe (src/lib/constantes.ts) :
-- les teintes réelles, claires et sombres, vivent dans globals.css.
create table if not exists subject (
  id          smallserial primary key,
  nom         text not null check (length(btrim(nom)) between 1 and 40),
  couleur     text not null default 'bleu' check (couleur in (
                'rouge','orange','ambre','olive','vert','sarcelle',
                'cyan','bleu','indigo','violet','magenta','rose')),
  position    integer not null default 0,
  -- Valeur de l'ancien enum correspondante : garde les deux colonnes
  -- synchronisées tant que l'enum existe.
  legacy      matiere unique,
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);
create unique index if not exists subject_nom_key on subject (lower(btrim(nom)));

insert into subject (nom, couleur, position, legacy) values
  ('Mathématiques', 'bleu',     10, 'Maths'),
  ('Physique',      'orange',   20, 'Physique'),
  ('Chimie',        'vert',     30, 'Chimie'),
  ('SI',            'cyan',     40, 'SI'),
  ('Français',      'violet',   50, 'Français'),
  ('Anglais',       'rose',     60, 'Anglais')
on conflict (legacy) do nothing;

alter table deck     add column if not exists subject_id smallint references subject(id);
alter table document add column if not exists subject_id smallint references subject(id);
alter table echeance add column if not exists subject_id smallint references subject(id);
-- « Sans matière » est représenté par subject_id null.
alter table deck alter column matiere drop not null;

update deck     t set subject_id = s.id from subject s where t.subject_id is null and s.legacy = t.matiere;
update document t set subject_id = s.id from subject s where t.subject_id is null and s.legacy = t.matiere;
update echeance t set subject_id = s.id from subject s where t.subject_id is null and s.legacy = t.matiere;

create index if not exists deck_subject_idx     on deck (subject_id);
create index if not exists document_subject_idx on document (subject_id) where deleted_at is null;

-- subject_id fait foi ; `matiere` en est le reflet pour l'ancien code.
-- Un écrit de l'ancien code (matiere seule) remplit subject_id.
create or replace function synchroniser_matiere() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and new.matiere is distinct from old.matiere
     and new.subject_id is not distinct from old.subject_id then
    new.subject_id := (select id from subject where legacy = new.matiere);
  elsif tg_op = 'INSERT' and new.subject_id is null and new.matiere is not null then
    new.subject_id := (select id from subject where legacy = new.matiere);
  end if;
  new.matiere := (select legacy from subject where id = new.subject_id);
  return new;
end $$;

drop trigger if exists deck_matiere_sync on deck;
create trigger deck_matiere_sync before insert or update of matiere, subject_id on deck
  for each row execute function synchroniser_matiere();
drop trigger if exists document_matiere_sync on document;
create trigger document_matiere_sync before insert or update of matiere, subject_id on document
  for each row execute function synchroniser_matiere();
drop trigger if exists echeance_matiere_sync on echeance;
create trigger echeance_matiere_sync before insert or update of matiere, subject_id on echeance
  for each row execute function synchroniser_matiere();

-- ---------------------------------------------------------------------
-- Abonnements aux paquets
-- ---------------------------------------------------------------------
-- Seuls les paquets suivis entrent dans les révisions, les statistiques
-- et les rappels. Se désabonner supprime la ligne, jamais card_state ni
-- review_log : un réabonnement reprend exactement où on en était.
create table if not exists deck_subscription (
  user_id    uuid   not null references app_user(id) on delete cascade,
  deck_id    bigint not null references deck(id)     on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, deck_id)
);
create index if not exists deck_subscription_deck_idx on deck_subscription (deck_id);

-- Une seule fois : les membres existants gardent les paquets qu'ils
-- révisaient déjà. Les nouveaux comptes ne sont abonnés à rien.
do $$ begin
  if not exists (select 1 from migration_unique where nom = 'abonnements_initiaux') then
    insert into deck_subscription (user_id, deck_id)
      select distinct s.user_id, k.deck_id
        from card_state s join card k on k.id = s.card_id
    on conflict do nothing;
    insert into migration_unique (nom) values ('abonnements_initiaux');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Retours (idées, bugs, autres)
-- ---------------------------------------------------------------------
create table if not exists feedback (
  id          bigserial primary key,
  user_id     uuid not null references app_user(id) on delete cascade,
  categorie   text not null check (categorie in ('idee','bug','autre')),
  message     text not null check (length(btrim(message)) between 5 and 2000),
  -- Page d'où le retour a été envoyé, pour reproduire un bug.
  page        text check (page is null or length(page) <= 300),
  statut      text not null default 'ouvert'
              check (statut in ('ouvert','prevu','refuse','termine')),
  reponse     text not null default '' check (length(reponse) <= 1000),
  traite_par  uuid references app_user(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists feedback_file_idx   on feedback (archived_at, statut, created_at desc);
create index if not exists feedback_auteur_idx on feedback (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- Colles
-- ---------------------------------------------------------------------
-- Le colloscope lui-même est dans le code (src/lib/colloscope) ; seul
-- le groupe du membre est en base. Sans groupe : aucun rappel de colle.
alter table app_user add column if not exists groupe_colle smallint
  check (groupe_colle is null or groupe_colle between 1 and 99);
-- « Plus tard » sur la demande de groupe ne vaut que pour la session :
-- la question revient à la connexion suivante.
alter table user_session add column if not exists groupe_reporte boolean not null default false;

commit;
