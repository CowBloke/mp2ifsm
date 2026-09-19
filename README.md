# mp2ifsm.com — portail de classe

Portail mobile en français pour la prépa MP2I/FSM : **Accueil, Fiches,
Documents, Marché, Profil**. Les rubriques utilisent les mêmes comptes,
sessions et tables PostgreSQL ; les fichiers restent privés sur le SSD.

L’accueil regroupe les révisions dues, les documents récents, les échéances
saisies par la classe et les marchés qui ferment bientôt.

## Fiches

Paquets partagés par matière et chapitre, corrections attribuées et historique
des deux faces, signalements, images collées/téléversées et LaTeX rendu par
KaTeX sur le serveur. Chaque membre possède son état FSRS personnel.
Espace révèle la réponse ; 1–4 donnent Encore, Difficile, Correct ou Facile.
Les aperçus sont signés, liés au membre et à la version de l’état ; une
révision concurrente ou rejouée ne peut pas écraser la planification.
Les statistiques comprennent la rétention, les sept prochains jours et les
révisions par membre et jour dans le paquet, exclusivement sur consentement.

Les imports `.apkg` lisent les collections SQLite héritées (`anki2` / `anki21`).
Dans Anki, cocher la compatibilité avec les anciennes versions. Chaque import
crée un nouveau paquet ; les premiers champs sont convertis en recto/verso.
Les modèles complexes et leur mise en page ne sont pas reproduits. Images,
accents et formules sont conservés ; sons et vidéos sont ignorés. Les exports
contiennent un modèle Basique, les images référencées et des GUID stables.

## Documents et capacité

`STORAGE_ROOT` vaut `/home/cowbloke/mp2ifsm-data` : sous-dossiers `documents`
et `card-images`, noms aléatoires, fichiers 600 et dossiers 700. Aucun alias
nginx ne doit exposer ces dossiers. Métadonnées, déposant et classement sont
en base ; les téléchargements authentifiés acceptent les plages d’octets
pour la visionneuse PDF intégrée.

Valeurs par défaut : **500 Mio par membre, 20 Gio pour la classe**, document
50 Mio maximum, image 8 Mio, import Anki 100 Mio. Les documents en corbeille
et les images des fiches comptent dans les mêmes plafonds. Le verrou de quota
PostgreSQL sérialise les envois ; une réserve supplémentaire de 5 Gio libres
sur le disque est imposée. Le NVMe avait 176 Gio disponibles au contrôle du
19 septembre 2026. Les images non référencées continuent de compter dans le
quota ; elles ne sont pas automatiquement supprimées.

Seul le déposant ou un administrateur peut supprimer/restaurer un document.
La suppression garde le fichier 30 jours. Le cron authentifié existant
`/api/cron/sync-deposits` purge les fichiers expirés avant la synchronisation.
La purge n’est pas une action serveur accessible depuis le navigateur.

Sauvegarder ensemble PostgreSQL et `STORAGE_ROOT`, avec les mêmes restrictions
d’accès ; une sauvegarde de la base seule ne contient aucun fichier.

## Validation et mise en service du portail

```bash
npm test
npm run typecheck
NEXT_BUILD_DIR=.next-portal-check npm run build
# Crée puis supprime un schéma de test et un stockage temporaire ; port 4261.
node --env-file=.env --conditions=react-server --import tsx tests/portal.integration.ts
# Ajoute Chromium, viewport mobile, Espace et touche 3 ; port CDP 4262.
TEST_BROWSER=1 node --env-file=.env --conditions=react-server --import tsx tests/portal.integration.ts
```

Pour une mise à jour du service existant, appliquer `db/schema-portal.sql`,
créer `STORAGE_ROOT`, construire le portail puis installer les fichiers
`deploy/mp2ifsm.service` et `deploy/nginx-mp2ifsm.conf` avant de redémarrer.
Le service doit pouvoir écrire dans `STORAGE_ROOT`. nginx doit accepter
101 Mio de multipart, `frame-src 'self'`, `frame-ancestors 'self'` et
`X-Frame-Options SAMEORIGIN` pour permettre les aperçus PDF. Valider nginx
avant son rechargement. La construction de vérification utilise un dossier
séparé et ne remplace pas le build `.next` du service en cours.

## Marché

Marché de prédiction **parimutuel** auto-hébergé pour la classe (~45 élèves).

Toutes les mises d'un marché vont dans une cagnotte commune. À la
résolution, la cagnotte est répartie entre les gagnants au prorata de
leur mise :

```
gain = mise × cagnotte ÷ total misé sur l'issue gagnante
```

Il n'y a ni bookmaker, ni prélèvement : **la cagnotte sortante vaut
exactement la cagnotte entrante**.

---

## Les règles que le code garantit

| Règle | Où elle est appliquée |
|---|---|
| L'argent est un grand livre en partie double, en centimes entiers | `db/schema.sql` — `ledger_transfer` / `ledger_entry` |
| Chaque mouvement = ≥ 2 écritures de somme nulle | contrainte différée `ledger_entry_balanced` |
| Un solde est **toujours** un `sum(amount)`, jamais une colonne | `account_balance()` ; aucune colonne solde n'existe |
| Le grand livre est immuable (pas d'UPDATE/DELETE) | trigger `forbid_mutation()` |
| Une mise est définitive | trigger `bet_append_only` |
| Un portefeuille ne peut pas passer à découvert | trigger `ledger_entry_no_overdraft` + verrou de ligne |
| Rejouer une requête ne double-crédite jamais | `ledger_transfer.idempotency_key` UNIQUE |
| L'argent n'entre que par dépôt, ne sort que par retrait | `record_deposit()` / `request_withdrawal()` |
| Un marché ne crée ni ne détruit d'argent | `settle_market()` vérifie que le séquestre retombe à 0 |
| Le reste de la division entière va au dernier gagnant réglé | `settle_market()` |
| Un marché résolu nomme forcément une issue, et elle lui appartient | `market_resolution_coherent` + FK composite |

Aucun calcul d'argent n'est fait côté client. Le navigateur affiche une
**estimation** de gain pendant la saisie ; le montant qui fait foi est
celui renvoyé par le serveur après écriture (`src/lib/actions.ts`).

---

## Installation

```bash
cd /home/cowbloke/projects/mp2ifsm
npm install

# 1. Base de données
sudo -u postgres createuser --pwprompt mp2ifsm
sudo -u postgres createdb -O mp2ifsm mp2ifsm

cp .env.example .env && chmod 600 .env   # puis renseigner DATABASE_URL etc.
set -a; . ./.env; set +a

npm run db:schema        # tables, contraintes, triggers
psql "$DATABASE_URL" -f db/functions.sql   # RPC monétaires
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema-portal.sql
mkdir -p /home/cowbloke/mp2ifsm-data

# 2. Initialisation des données
ADMIN_PASSWORD='choisir-un-mot-de-passe' npm run db:seed -- --reset

# 3. Build et service
npm run build
sudo cp deploy/mp2ifsm.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now mp2ifsm

# 4. Front nginx
sudo cp deploy/nginx-mp2ifsm.conf /etc/nginx/sites-available/mp2ifsm
sudo ln -sfn /etc/nginx/sites-available/mp2ifsm /etc/nginx/sites-enabled/mp2ifsm
sudo nginx -t && sudo systemctl reload nginx

# 5. Tâches périodiques
sudo cp deploy/mp2ifsm-cron /etc/cron.d/mp2ifsm && sudo chmod 644 /etc/cron.d/mp2ifsm
```

Le routage public (DNS Cloudflare + ingress du tunnel) est décrit dans
`TUNNEL-RUNBOOK.md`, section mp2ifsm.com.

### Créer le premier administrateur

```bash
psql "$DATABASE_URL" -c "update app_user set role='admin' where email='...'"
```

### Code d'invitation

L'inscription est fermée : il faut un code de la table `invite_code`.

```bash
psql "$DATABASE_URL" -c "insert into invite_code (code, max_uses) values ('MP2I-2026', 50)"
```

---

## Vérifier les comptes

```bash
npm run db:reconcile
```

Les huit contrôles doivent afficher `OK`. Le plus important :

* **somme totale du grand livre = 0** (la partie double tient) ;
* **avoirs internes = dépôts externes nets** (chaque centime détenu par
  un membre ou un séquestre correspond à un vrai dépôt).

Le même rapprochement est affiché en permanence en haut de `/admin`, et
tourne chaque nuit par cron.

### Tests d'invariants

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/test_invariants.sql
```

27 contrôles : la moitié vérifie que les opérations normales marchent,
l'autre moitié tente de **violer** les invariants (transfert
déséquilibré, découvert, modification d'un pari, double règlement,
résolution avec l'issue d'un autre marché…) et exige un refus de la
base. Le script se termine par `rollback`.

---

## Les dépôts viennent d'une API externe

⚠️ **Hypothèse à valider.** L'API du site externe n'était pas spécifiée.
Tout ce qui la concerne est isolé derrière l'interface
`FournisseurDepots` (`src/lib/external.ts`) ; l'implémentation par
défaut (`mock`) ne crédite rien.

Pour brancher le vrai service : écrire une classe qui implémente
`listerPaiements()`, puis `DEPOSIT_PROVIDER=http` (ou le nom choisi) dans
`.env`. Une implémentation HTTP générique est fournie ; elle attend
`{ payments: [{ id, email, amount_cents }] }` et il suffit d'adapter le
mapping.

**Le seul contrat indispensable** est que chaque paiement expose un
identifiant stable et unique (`source_ref`) : c'est lui qui rend le
tirage idempotent. On peut rejouer tout l'historique sans jamais
créditer deux fois.

En attendant, un administrateur peut créditer à la main via
`crediterManuellement()` (référence unique obligatoire).

---

## Structure

```
db/schema.sql           tables, contraintes, triggers
db/functions.sql        RPC monétaires (place_bet, settle_market, …)
db/reconcile.sql        rapprochement comptable
db/test_invariants.sql  27 tests d'invariants
scripts/seed.ts         initialise le compte administrateur
src/lib/db.ts           pool PostgreSQL + helper de transaction
src/lib/actions.ts      actions serveur — seule surface de mutation
src/lib/queries.ts      modèles de lecture
src/lib/external.ts     adaptateur de dépôts externes
src/lib/money.ts        formatage des centimes (aucun calcul de solde)
src/lib/errors.ts       codes SQL → messages français
src/components/         interface (feuille de pari, cartes, squelettes)
deploy/                 systemd, nginx, cron
```

## Écrans

* `/` — fil des marchés : question, cotes implicites et barre
  proportionnelle, cagnotte, temps restant, votre position ;
* `/marche/<slug>` — détail + feuille de pari (issue, montant ou
  25 %/50 %/Max, gain projeté en direct, un seul bouton) ;
* `/moi` — solde, dépôt/retrait, positions ouvertes, historique, relevé ;
* `/classement` — classement **au gain net**, pas au solde brut ;
* `/admin` — création et résolution des marchés, rapprochement en direct.


## Déploiement actif — 19 septembre 2026

Le portail est publié sur https://mp2ifsm.com avec le build
`.next-release-20260919-portal` (variable `NEXT_BUILD_DIR` du service installé).
Les configurations nginx et systemd du portail sont actives. Les pages
publiques, les pages authentifiées et un envoi/téléchargement sur SSD ont été
vérifiés. L’ancien build `.next` et la sauvegarde privée
`/home/cowbloke/backups/mp2ifsm-deploy-20260919-portal` sont conservés pour retour
arrière. Ne pas construire les prochains tests dans le répertoire du build actif.
