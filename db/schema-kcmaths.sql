-- Transferts de KC coins avec kcmaths.com (migration additive).
--
-- Chaque ligne est un appel a kcmaths.com/api/mp2ifsm.php identifie par
-- `ref`. Le serveur PHP dedoublonne sur cette meme ref : rejouer un
-- transfert en_attente ne debite ni ne credite jamais deux fois.
--
--   depot   : kcmaths debite d'abord ; le grand livre n'est credite
--             (record_deposit) qu'apres confirmation.
--   retrait : le grand livre est debite d'abord (request_withdrawal) ;
--             un refus definitif de kcmaths rembourse par record_deposit.
begin;

create table if not exists kcmaths_transfer (
  id          bigserial primary key,
  ref         uuid not null unique,
  user_id     uuid not null references app_user(id) on delete restrict,
  -- Email fige au moment de la demande : un changement d'email ensuite
  -- ne redirige pas un transfert deja engage vers un autre compte.
  email       text not null,
  sens        text not null check (sens in ('depot', 'retrait')),
  -- KC coins entiers ; le grand livre en recoit montant x 100 centiemes de PCK.
  montant     bigint not null check (montant > 0),
  statut      text not null default 'en_attente'
                check (statut in ('en_attente', 'effectue', 'refuse')),
  motif       text,
  tentatives  integer not null default 0,
  cree_le     timestamptz not null default now(),
  maj_le      timestamptz not null default now()
);

create index if not exists kcmaths_transfer_en_attente_idx
  on kcmaths_transfer (cree_le) where statut = 'en_attente';
create index if not exists kcmaths_transfer_user_idx
  on kcmaths_transfer (user_id, cree_le desc);

commit;
