-- Rubrique Cours : chapitres, PDF (cours, corrigés, DM), texte des pages
-- pour la recherche, et paquets de fiches proposés par chapitre.
-- Le contenu est publié par une source externe authentifiée (COURS_TOKEN,
-- route /api/cours/publier) ; les membres le lisent seulement.
-- Migration additive et rejouable.

create table if not exists cours_chapitre (
  id          bigserial primary key,
  -- Identifiant stable choisi par la source (« maths-ch6 ») : republier met à jour.
  cle         text not null unique check (cle ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  subject_id  smallint references subject(id) on delete set null,
  numero      smallint check (numero between 0 and 999),
  titre       text not null check (length(btrim(titre)) between 1 and 160),
  resume      text not null default '' check (length(resume) <= 2000),
  position    integer not null default 0,
  updated_at  timestamptz not null default now()
);

create table if not exists cours_fichier (
  id           bigserial primary key,
  chapitre_id  bigint not null references cours_chapitre(id) on delete cascade,
  cle          text not null check (cle ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  genre        text not null check (genre in ('cours', 'correction', 'dm', 'td', 'autre')),
  titre        text not null check (length(btrim(titre)) between 1 and 160),
  storage_name text not null check (storage_name ~ '^[a-f0-9]{32}$'),
  taille       bigint not null check (taille > 0),
  sha256       bytea not null,
  pages        integer not null default 0 check (pages >= 0),
  position     integer not null default 0,
  updated_at   timestamptz not null default now(),
  unique (chapitre_id, cle)
);

-- Une ligne par page : la recherche renvoie la page exacte à ouvrir.
create table if not exists cours_page (
  fichier_id bigint not null references cours_fichier(id) on delete cascade,
  numero     integer not null check (numero >= 1),
  texte      text not null,
  recherche  tsvector generated always as (to_tsvector('french', texte)) stored,
  primary key (fichier_id, numero)
);
create index if not exists cours_page_recherche_idx on cours_page using gin (recherche);

create table if not exists cours_paquet (
  chapitre_id bigint not null references cours_chapitre(id) on delete cascade,
  deck_id     bigint not null references deck(id) on delete cascade,
  position    integer not null default 0,
  primary key (chapitre_id, deck_id)
);
