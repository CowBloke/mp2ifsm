# mp2ifsm.com — portail de classe

Portail mobile en français pour la prépa MP2I/FSM : **Accueil, Fiches,
Colles, Documents, Divertissement** (et le Profil depuis l’avatar). Les rubriques utilisent les mêmes comptes,
sessions et tables PostgreSQL ; les fichiers restent privés sur le SSD.

L’accueil montre d’abord la semaine (colles du groupe et échéances saisies
par la classe), puis une ligne pour les révisions dues et une pour le marché
qui ferme le plus tôt. Une échéance n’a qu’un titre (le type, « DS », « DM »…,
s’écrit dedans), une matière facultative et une date ; tout membre peut en
corriger une en touchant sa ligne. Les colles viennent du colloscope et ne se
modifient pas ici. La colonne `echeance.kind` reste en base (défaut `Autre`)
mais n’est plus lue.

## Fiches

Page Fiches : **Récemment ajoutés**, **Suivis**, puis tous les paquets **par
matière**. Un paquet se crée avec un titre seulement (la colonne historique
`chapitre` reprend le titre). Chaque membre peut aimer un paquet
(`deck_like`, un par membre). Le créateur — ou un admin — clique **Modifier**
sur la page du paquet : onglet *Infos* (titre, description, matière, dossier)
et onglet *Contenu* (ajouter une carte, ou **mettre à jour depuis Anki** : les
cartes sont rapprochées par GUID, gardent leur id et la progression de chacun,
chaque changement laisse une version « Mise à jour depuis Anki » ; option pour
retirer les cartes importées absentes du fichier, jamais celles ajoutées dans
le portail ; les images identiques sont réutilisées).

L’accueil affiche un **message de la classe** (table `message_accueil`, une
ligne) qu’un administrateur écrit, modifie ou retire directement sur la page.
Ces deux tables sont dans `db/schema-dossiers.sql` (bloc du 3 novembre 2026),
que le script de build installé rejoue déjà.

Paquets partagés par matière, corrections attribuées et historique
des deux faces, signalements, images collées/téléversées et LaTeX rendu par
KaTeX sur le serveur. Chaque membre possède son état FSRS personnel.
Espace révèle la réponse ; 1–4 donnent Encore, Difficile, Correct ou Facile.
Une carte peut être un **texte à trous** : dans l’éditeur, choisir « Texte à
trous », sélectionner un mot puis « Masquer la sélection » (syntaxe
`{{c1::mot}}`, comme Anki). En révision, s’il y a plusieurs trous, chaque appui
(ou Espace) dévoile un seul trou tiré au hasard ; les notes apparaissent une
fois tous les trous ouverts, ou après « Tout afficher ».
Les aperçus sont signés, liés au membre et à la version de l’état ; une
révision concurrente ou rejouée ne peut pas écraser la planification.
Les statistiques comprennent la rétention, les sept prochains jours et les
révisions par membre et jour dans le paquet, exclusivement sur consentement.

Les imports `.apkg` lisent les collections SQLite héritées (`anki2` / `anki21`).
Dans Anki, cocher la compatibilité avec les anciennes versions. Chaque import
crée un nouveau paquet ; les premiers champs sont convertis en recto/verso.
Un champ identique sur toutes les notes (étiquette de chapitre) est ignoré.
Les modèles complexes et leur mise en page ne sont pas reproduits. Images,
accents et formules sont conservés ; sons et vidéos sont ignorés. Les exports
contiennent un modèle Basique, les images référencées et des GUID stables.

## Notifications et flash du jour

Le portail est une **web app installable** (`src/app/manifest.ts`, icônes
dans `public/icons/`) avec un service worker minimal (`public/sw.js` :
notifications seulement, aucun cache). Sur iPhone/iPad, les notifications
n’existent qu’une fois l’app ajoutée à l’écran d’accueil (iOS 16.4+).

Trois fenêtres (`src/components/Notifications.tsx`), une seule par page,
jamais pendant une révision ni par-dessus la demande de groupe :

1. **Installation** (mobile hors app) : « Installer l’app ? » puis un
   tutoriel propre à l’appareil (Safari/Chrome iOS, Chrome, Samsung,
   Firefox Android ; ordinateur depuis le profil). « Plus tard » revient
   après 3 jours, « Non merci » jamais (mémorisé sur l’appareil).
2. **Rappel des fiches** : une notification par jour à l’heure choisie par
   le membre (18 h par défaut, de 7 h à 22 h, `notif_pref.flash_heure`). Elle
   ouvre `/flash` : 3 cartes au plus des paquets suivis (dues d’abord, puis
   neuves au hasard), notées comme une révision normale. Rien n’est envoyé
   s’il n’y a aucune carte. Posée une fois (`notif_pref.flash_repondu`).
3. **Notifications** dans l’app installée si l’appareil n’est pas abonné :
   devoirs (la veille à 19 h, échéances du lendemain) et messages de la
   classe (case « Envoyer en notification » quand un admin publie).

Le planificateur tourne dans le processus Next.js (`src/instrumentation.ts`,
une passe par minute, `MP2_NOTIFS=off` le coupe). `notif_envoi` garantit un
seul envoi par membre, genre et jour. Les clés VAPID sont créées au premier
besoin dans `push_cle` ; un abonnement qui répond 404/410 est supprimé.
Réglages et notification de test dans le Profil. Tables dans
`db/schema-dossiers.sql` (bloc du 4 novembre 2026).

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

## Divertissement

L’onglet **Divertissement** (`/divertissement`) regroupe le **Marché**
(`/marche`, inchangé), les **Vidéos** éducatives (ci-dessous) et les **Réels** (`/divertissement/reels`) : une blague
façon reels d’Instagram où chaque « vidéo » est un nombre réel tiré au hasard
(décimaux, √n, notation scientifique, π, e, φ…), avec des commentaires
élogieux et des compteurs fictifs. Tout est généré dans le navigateur
(`src/lib/reels.ts`) ; likes, abonnements et commentaires ajoutés ne sont
pas enregistrés et disparaissent au rechargement.

## Toilet! (rubrique cachée)

« Toilet factorielle » : classement des passages aux toilettes du bas, avec
photo de preuve de propreté facultative et statuts à jeux de mots
(`src/lib/toilet-statuts.ts`, de « Vessie de pierre » à « Divinité de la
chasse d’eau »).

La rubrique n’existe pour un membre qu’après ouverture du lien secret
`/toilet/rejoindre/<code>` puis appui sur « Entrer dans le petit coin » (les
aperçus de lien des messageries n’activent donc rien). Avant cela, `/toilet`
et les photos répondent 404 et la tuile n’apparaît pas dans Divertissement.
Les membres peuvent repartager le lien depuis le bas de la page. Le code
(32 hex) est tiré au hasard par la migration et n’est jamais réécrit :

```bash
psql "$DATABASE_URL" -Atc "select 'https://mp2ifsm.com/toilet/rejoindre/' || code_invitation from toilet_config"
```

Pour changer le lien : `update toilet_config set code_invitation = replace(gen_random_uuid()::text,'-','');`
(les membres déjà inscrits le restent).

Un passage toutes les 3 minutes au plus par membre. La photo est réduite à
1600 px en JPEG dans le navigateur, stockée dans `STORAGE_ROOT/toilet-photos`
(600, nom aléatoire), servie uniquement aux membres et comptée dans le quota
commun. Le membre (ou un administrateur) peut supprimer un passage ; la photo
part avec. Classement par semaine (lundi, heure de Paris), mois ou depuis
toujours ; le statut dépend toujours du total.

Migration : `db/schema-toilet.sql` (additive, rejouable). **À appliquer avant
de déployer le code** : le calcul du quota lit `toilet_passage`, donc sans la
table tous les envois de fichiers échoueraient. Le script de construction
installé (`/usr/local/libexec/mp2ifsm-build-release`) est une copie figée qui
ne l’applique pas. Test de bout en bout (schéma et stockage jetables) :

```bash
NEXT_BUILD_DIR=.next-portal-check npm run build
node --env-file=.env --conditions=react-server --import tsx tests/toilet.integration.ts
```

## Vidéos éducatives

`/divertissement/videos` : les membres publient des vidéos où ils expliquent
une notion à la classe, présentées comme sur un réseau social. L’onglet
ouvre **directement le fil**, vraiment plein écran : la navigation
principale est masquée, la vidéo (portrait) remplit l’écran, une vidéo en
paysage est posée sur sa couverture floutée. Toucher = pause, double
toucher = j’aime, barre de temps qu’on fait glisser, ↑/↓ (ou j/k) et m au
clavier. **Lecture fluide** (`FilVideos.tsx`) : trois éléments `<video>`
seulement, recyclés (écran *i* → lecteur *i* mod 3) et déplacés dans le
DOM ; la précédente, la courante et la suivante sont toujours chargées
(Safari ne précharge qu’après un `play()` muet, fait en avance), et la
vidéo démarre dès qu’elle occupe la moitié de l’écran. Si le navigateur
refuse le son (aucun geste encore), le premier toucher le rétablit sur
les trois lecteurs à la fois (Safari l’accorde élément par élément). Une
barre basse posée sur la vidéo donne **Fil · + · Profil** : le **+**
ouvre le studio. Toucher un auteur (dans le fil ou les commentaires) ouvre
son **profil** (`/divertissement/videos/profil/<id>`, `moi` pour soi) :
compteurs, grille de ses vidéos, puis fil limité à ses vidéos
(`?auteur=`). L’étiquette de matière filtre le fil (`?matiere=`). Le
profil personnel montre les vidéos en montage ; on y arrive après la
publication.

**Tout se filme dans l’app** (`/divertissement/videos/nouvelle`, aucun
import de vidéo) : caméra avant/arrière, minuteur 3 s, plusieurs clips
d’affilée, 3 minutes au total. **Filtres façon Snap** : on glisse à
gauche/à droite sur l’image (ou on touche la bande de pastilles) pour
changer de filtre en direct ; chaque clip garde le sien (`clips[].filtre`
du montage, modifiable ensuite dans l’onglet *Filtres*, « appliquer à
tous »). Treize filtres (Vif, Vintage, Ciné, Pop, Rêve, Bleu nuit, Matrix,
N&B, Tableau, Négatif…), définis par des fonctions CSS dont dérivent les
matrices ffmpeg (`hue-rotate` et `invert` en plus) ; la vignette suit
exactement le `vignette` de ffmpeg (1 − cos⁴(π/5·r)).

**Lentilles** (onglet *Lentilles* de la caméra, à côté de *Filtres*) :
effets sur le visage, suivis par MediaPipe Face Landmarker (478 points et
expressions : bouche ouverte, sourcils, sourire), dessinés dans un
`<canvas>` enregistré tel quel (`canvas.captureStream`, micro et
bruitages mixés en Web Audio) : l'effet est dans le clip. Sortie toujours
en portrait 9:16. Onze lentilles (`src/components/videos/lentilles/catalogue.ts`),
dans l'esprit des formats viraux mais écrites pour la prépa : Arrêt sur
image (narration), Zoom dramatique, Sourcils suspects (boom), Randomiseur
prépa, Pensées intrusives, PNJ, Détecteur de mensonge, Yeux laser,
Caricature, Double bouche, Mode boss. Images, sons et textes sont produits
par le code, rien n'est repris d'ailleurs ; on déclenche d'une expression ou
d'un toucher. Le modèle (`public/lentilles/face_landmarker.task`, Apache
2.0) est versionné ; le moteur WebAssembly est copié depuis
`@mediapipe/tasks-vision` vers `public/lentilles/wasm` par
`scripts/copier-mediapipe.mjs` (`prebuild`/`predev`). nginx doit
autoriser `'wasm-unsafe-eval'` dans `script-src` (déjà dans
`deploy/nginx-mp2ifsm.conf`, à recharger).

**Musique** : pastille « Ajouter un son » sur la caméra et onglet *Son*
de l’éditeur. Bibliothèque de cinq boucles (`public/musique/*.m4a`)
entièrement synthétisées par `scripts/generer-musiques.ts` (aucun droit
tiers ; `node --experimental-strip-types scripts/generer-musiques.ts`
les régénère, il faut ffmpeg), ou fichier audio du téléphone (MP3, M4A,
WAV, OGG, FLAC ; 15 Mo au plus, envoyé avec les clips et rangé après eux
dans `sources`). Réglages : volume de la musique, volume de la voix,
point de départ. Au rendu, la musique est bouclée (`-stream_loop`),
fondue sur la fin et mixée aux voix (`amix` + `alimiter`) ; un fichier
illisible est ignoré. Le titre s’affiche dans le fil (« ♪ … », disque).
Sur iPhone, l’aperçu ne peut pas baisser le volume de la voix (Safari
ignore `volume`) ; le rendu, lui, l’applique. L’**éditeur** intégré (`Editeur.tsx`) :
couper le début/la fin d’un clip, le scinder à la tête de lecture, le
déplacer, couper son son, le supprimer, refilmer ; textes à l’écran
(position, taille, bandeau ou ombre, plage de temps) ; six filtres ; image
de couverture. Aucun réencodage dans le navigateur : l’aperçu imite le
résultat (filtre CSS, textes à l’échelle exacte de l’image finale) et la
publication envoie les clips bruts (WebM ou MP4 de `MediaRecorder`,
90 Mo au plus) avec la description du montage (`src/lib/videos-montage.ts`,
validée par zod).

Le **rendu** se fait sur le Pi (`src/lib/videos-rendu.ts`) : file en base
(`video.statut = 'traitement'`), une vidéo à la fois, `nice ffmpeg` sur
3 cœurs (≈ 0,7 × la durée), H.264/AAC 720×1280 (ou 1280×720 si le premier
clip est en paysage), `+faststart`, couverture JPEG 360 px. Les filtres
sont définis une fois comme fonctions CSS dont on dérive les matrices
`colorchannelmixer` exactes ; les textes passent par `drawtext` avec la
police `public/fonts/DejaVuSans-Bold.ttf` (symboles mathématiques ⇒ ∃ ∀…),
la même que l’aperçu. Trois tentatives, puis « échec ». La file reprend
au démarrage (`instrumentation.ts`, `MP2_VIDEOS=off` la coupe) et est
relancée toutes les 2 minutes. Les clips bruts sont supprimés après rendu.

Fichiers dans `STORAGE_ROOT/videos` (noms aléatoires, 600), servis par
`/api/videos/[id]` (session obligatoire, plages d’octets ;
`?couverture=1` pour la vignette). La taille (clips bruts pendant le
rendu, puis vidéo + couverture) compte dans le quota commun. L’auteur ou
un admin supprime la vidéo (fichiers effacés aussitôt) ; un commentaire se
supprime par son auteur, l’auteur de la vidéo ou un admin. Tables
`video`, `video_like`, `video_vue`, `video_commentaire` dans
`db/schema-dossiers.sql` (bloc du 5 novembre 2026).

nginx doit autoriser `Permissions-Policy: camera=(self), microphone=(self)`
et `media-src 'self' blob:` (aperçu des clips en mémoire).

```bash
npm test                                  # tests/videos.test.ts (montage)
# Rendu ffmpeg réel sur des clips synthétiques ($STORAGE_ROOT/videos/{a,b,c}×32) :
STORAGE_ROOT=/chemin node --import tsx tests/videos-rendu.integration.ts
# Bout en bout dans Chromium avec caméra simulée (port 4263, CDP 4264) :
node --env-file=.env --conditions=react-server --import tsx tests/videos.browser.integration.ts
```

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
| L'argent est un grand livre en partie double, en centièmes de pricoupenkoin | `db/schema.sql` — `ledger_transfer` / `ledger_entry` |
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
cd /home/cowbloke/projects/apps/mp2ifsm
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

## KC coins — transferts avec kcmaths.com

La monnaie du portail est le **pricoupenkoin** (PCK), divisible au centième :
le grand livre compte en centièmes de PCK (les colonnes et variables nommées
« centimes » sont historiques). 1 KC coin de kcmaths.com = 1 PCK, et les
transferts se font en **KC coins entiers** : un solde de 25,37 PCK permet de
renvoyer 25 KC, les 0,37 restent sur mp2ifsm. Profil → **Déposer** / **Retirer** appelle
`kcmaths.com/api/mp2ifsm.php` (fichier PHP fourni au professeur) avec
`{ ref, email, delta }` et `Authorization: Bearer $KCMATHS_API_TOKEN`.
Le PHP dédoublonne sur `ref` et refuse un solde négatif (409).

* **Dépôt** : kcmaths débite d'abord, puis `record_deposit()` crédite.
* **Retrait** : `request_withdrawal()` débite d'abord, puis kcmaths crédite ;
  un refus définitif (400/404/409) rembourse par `record_deposit()`.
* Sans réponse (réseau, 401/403, 5xx), le transfert reste `en_attente` dans
  `kcmaths_transfer` et le cron `/api/cron/sync-deposits` le rejoue avec la
  même `ref` toutes les 10 minutes. Il n'est jamais abandonné.

Les élèves sont reconnus par leur email : il doit être identique sur les deux
sites. Configuration : `KCMATHS_API_URL` et `KCMATHS_API_TOKEN` dans `.env` ;
sans elles, les transferts sont désactivés. Migration : `db/schema-kcmaths.sql`.
Test : `node --env-file=.env --conditions=react-server --import tsx tests/kcmaths.integration.ts`
(schéma isolé, kcmaths simulé).

Un administrateur peut toujours créditer à la main via
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
src/lib/kcmaths.ts      transferts de KC coins avec kcmaths.com
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

## Administration du profil et propositions (19 septembre 2026)

Dans **Profil → Administration**, les administrateurs retrouvent les propositions
à approuver/refuser, l’annuaire de tous les comptes (recherche, rôle, inscription,
sessions actives et déconnexion des autres comptes), ainsi que les outils de
création/résolution et le rapprochement comptable. `/admin` redirige vers cet onglet.
Les actions vérifient le rôle côté serveur ; aucun hash de mot de passe ni jeton
n’est envoyé dans l’annuaire.

**Marché → Proposer un pari** envoie une question, une règle de résolution,
une fermeture et 2–10 issues. La proposition reste privée au proposant et aux
administrateurs jusqu’à son approbation. Le profil affiche son statut et le
message de modération. L’approbation crée le marché et ses issues dans une seule
transaction avec verrou : deux validations concurrentes ne publient jamais deux
marchés. Une proposition expirée doit être refusée puis soumise avec une nouvelle
date. Maximum : 10 propositions en attente par compte.

La lune en haut à droite active le thème sombre partagé ; le choix est mémorisé
sur cet appareil. Au premier affichage, le thème suit la préférence système.

Migration additive : `db/schema-proposals.sql`, après les schémas existants.
Build actif : `.next-release-20260919-admin`. Sauvegarde avant déploiement :
`/home/cowbloke/backups/mp2ifsm-admin-20260919` (dump PostgreSQL et ancienne unité).
Retour arrière : réinstaller `service.before`, daemon-reload et redémarrer
`mp2ifsm`. Conserver la table additive pour préserver les propositions reçues.

Validation : build, typecheck, tests unitaires, 44 assertions d’intégration en
schéma isolé et Chromium mobile (thème persistant, formulaire de proposition,
révisions). Vérification publique avec `scripts/check-admin-live.ts` : sessions
éphémères nettoyées à la fin, sans ajout de compte, proposition ou marché.

## Déploiement continu avec approbation

Chaque push sur `main` déclenche `.github/workflows/production.yml` : installation
propre, tests, vérification TypeScript et build. Si tout réussit, le job attend
l’approbation de l’environnement GitHub `production`. L’approbation avance la
branche technique `production` sur le SHA exact validé ; elle ne déploie aucun
code depuis un runner GitHub sur le serveur.

Le timer local `mp2ifsm-deploy.timer` vérifie cette branche toutes les deux
minutes. Un nouveau SHA approuvé est préparé dans
`/var/lib/mp2ifsm-deploy/releases/<sha>` par l’utilisateur `cowbloke`, revalidé,
construit avec `.next-production`, puis les migrations idempotentes sont
appliquées. Le lien `/var/lib/mp2ifsm-deploy/current` n’est remplacé qu’après ces
étapes. Le service est redémarré et contrôlé sur loopback ; en cas d’échec, le
lien et le service reviennent au build précédent. Les migrations doivent donc
rester additives et compatibles avec la version précédente.

Le script d'aide n'est pas mis à jour par le déploiement : quand
`deploy/build-release.sh` ajoute une migration, la lancer et réinstaller
les scripts avec `bash scripts/remise-en-etat.sh` (rejouable, ne
réinstalle que ce qui diffère).

Installation ou restauration des unités (les copies sous `/etc` et
`/usr/local/sbin` doivent rester détenues par root) :

```bash
sudo install -d -o root -g root -m 0755 /usr/local/libexec
sudo install -o root -g root -m 0755 deploy/build-release.sh /usr/local/libexec/mp2ifsm-build-release
sudo install -o root -g root -m 0755 deploy/mp2ifsm-auto-deploy /usr/local/sbin/mp2ifsm-auto-deploy
sudo install -o root -g root -m 0644 deploy/mp2ifsm.service /etc/systemd/system/mp2ifsm.service
sudo install -o root -g root -m 0644 deploy/mp2ifsm-deploy.service /etc/systemd/system/mp2ifsm-deploy.service
sudo install -o root -g root -m 0644 deploy/mp2ifsm-deploy.timer /etc/systemd/system/mp2ifsm-deploy.timer
sudo systemctl daemon-reload
sudo systemctl enable --now mp2ifsm-deploy.timer
```

Diagnostic : `systemctl status mp2ifsm-deploy.timer` et
`journalctl -u mp2ifsm-deploy.service`. Un redéploiement ne se fait jamais en
déplaçant manuellement la branche `production` : relancer le workflow sur le SHA
voulu et approuver le job conserve la piste d’audit GitHub.

## Matières, abonnements, retours et colles (21 septembre 2026)

Migration additive : `db/schema-etudes.sql`, appliquée après
`schema-proposals.sql` (ajoutée à `deploy/build-release.sh`). Elle est
rejouable : les données qui ne doivent être migrées qu’une fois sont
protégées par la table `migration_unique`.

**Matières.** Table `subject` gérée dans **Profil → Administration →
Matières** : ajouter, renommer, ordonner, colorer, archiver. Une matière
archivée reste affichée sur le contenu existant mais n’est plus proposée ;
« Sans matière » correspond à `subject_id` nul. Les couleurs viennent d’une
palette fixe de 12 teintes (`PALETTE` dans `src/lib/constantes.ts`, valeurs
`--matiere-*` dans `globals.css`) de luminance et saturation identiques,
lisibles en clair comme en sombre. À luminance égale, deux teintes voisines
restent proches : la couleur n’est jamais le seul indice, le nom de la
matière est toujours affiché. L’ancienne colonne enum `matiere` reste
synchronisée par trigger pour que le build précédent fonctionne en cas de
retour arrière.

**Abonnements aux paquets.** Tous les paquets restent visibles ; seuls les
paquets suivis (`deck_subscription`) entrent dans la file de révision, les
statistiques, la heatmap et les rappels. Se désabonner ne supprime ni
`card_state` ni `review_log`. Aucun abonnement automatique pour les nouveaux
comptes ; à la migration, les membres existants suivent les paquets qu’ils
avaient déjà révisés. Créer ou importer un paquet y abonne son auteur.

**Retours.** Bouton « Retour » en haut de chaque page (membres connectés) :
idée, bug ou autre, avec l’auteur et la page d’envoi. Les administrateurs
filtrent, répondent, changent le statut (ouvert, prévu, refusé, terminé) et
archivent dans **Administration → Retours** ; l’auteur suit le statut dans
**Profil → Mes retours**. 20 retours par jour et par membre au maximum.

**Colloscope.** Les données sont dans le code : `src/lib/colloscope/`
(`types.ts` pour le modèle, un fichier par période, registre `PERIODES`
dans `index.ts`). Pour ajouter un semestre : copier
`2026-2027-s1.ts`, renseigner créneaux, rotations, semaines et planning,
puis l’ajouter à `PERIODES` ; `tests/colloscope.test.ts` vérifie la
cohérence de chaque période. Les heures sont des heures de Paris. Seul le
numéro de groupe est en base (`app_user.groupe_colle`) ; tant qu’il manque,
une fenêtre le demande à chaque connexion (« Plus tard » vaut pour la
session). Page `/colles` : semaine en calendrier, créneau de repli de P2,
notes du colloscope. Les rappels (colles sous 36 h, cartes dues des paquets
suivis, échéances sous 48 h) sont affichés uniquement dans le portail, sur
l’accueil ; sans groupe, aucun rappel de colle.

## Audit et réparation du formatage des fiches

Le scanner partagé préserve les accolades LaTeX dans les textes à trous,
les formules sur plusieurs lignes et les délimiteurs Anki. Une formule
contenant des trous se révèle comme un tout pour conserver les fractions,
indices et matrices composés par KaTeX. Les intervalles `[a,b]` restent
inchangés lors de la restauration des anciens imports.

```bash
node --env-file=.env --conditions=react-server --import tsx scripts/audit-card-formatting.ts
# Un manifeste privé contient id, before:{recto,verso}, after:{recto,verso}.
node --env-file=.env --conditions=react-server --import tsx scripts/repair-card-formatting.ts /chemin/manifeste.json
REPAIR_ADMIN_EMAIL=administrateur@exemple.fr node --env-file=.env --conditions=react-server --import tsx scripts/repair-card-formatting.ts /chemin/manifeste.json --apply
```

La réparation refuse toute carte modifiée depuis l'audit, garde les deux
versions dans l'historique, sauvegarde le manifeste en fichier privé et
vérifie que les états FSRS restent identiques. L'audit du 8 octobre 2026 a
couvert 882 cartes dans 12 paquets ; 117 cartes nécessitaient une réparation
stockée. Les tests incluent la révélation des formules et le débordement sur
mobile. La vérification porte sur le formatage, pas sur la justesse des cours.
