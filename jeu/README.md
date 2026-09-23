# Jeu de combat de la classe

Jeu de plateforme-combat 2D, de 2 à 4 joueurs, en manches, intégré au
site sous `/jeu` (masqué tant que `JEU_ACTIF` ne l'ouvre pas).

## Organisation

```
jeu/noyau/    simulation pure, en entiers, 60 ticks/s (ni DOM, ni Node, ni Pixi, ni React)
  contenu/    personnages et cartes : uniquement des données
jeu/client/   rendu PixiJS, clavier/manette, caméra, sessions (locale, réseau)
jeu/serveur/  serveur de partie Node séparé (WebSocket)
jeu/tests/    tests sans navigateur (node:test)
src/app/jeu/  pages du site : conteneurs et menus, aucune logique de jeu
```

`jeu/tests/frontieres.test.ts` fait échouer les tests si ces frontières
sont franchies, ou si le moteur cite un personnage par son nom.

## Le moteur en bref

- **Unités** : positions en centièmes de pixel, vitesses par tick, durées
  en ticks, multiplicateurs en millièmes. Tout est entier : le serveur et
  les navigateurs calculent exactement la même chose.
- **Un tick** (`monde.ts`) : commandes et physique de chaque combattant,
  résolution des coups (collectés puis appliqués ensemble : les échanges
  sont équitables), chutes, fin de frame des coups, règles de manche.
- **Coups** (`definitions.ts`) : données de frames — hitboxes (dégâts,
  recul, angle, hitstun, gel, groupes pour les multi-coups), mouvements
  imposés, enchaînements, armure, invulnérabilité, contre, charge,
  recharge, coût en jauge. Un emplacement vide retombe sur un plus
  général (`air_bas` → `air_neutre`).
- **Statuts** (`statuts.ts`) : bibliothèque générique (ralenti, étourdi,
  silence, intimidé, galvanisé, marqué, armure, apesanteur, ébloui,
  dominé).
- **Entités** (`entites.ts`) : tout ce qu'un coup fait apparaître —
  projectiles, objets qui rebondissent, zones périodiques, pièges armés
  puis déclenchés, attraction, grappin, bouclier, explosion en fin de vie
  (`surFin`). Un seul code, entièrement piloté par les définitions
  (`EntiteDef`) ; un objet lancé à bout portant contre un mur naît contre
  le mur, jamais dedans.
- **Bots** (`bots/`) : déterministes (graine), avec un temps de réaction,
  quatre niveaux ; ils lisent les coups dans les données (`analyse.ts`),
  jamais un nom de personnage. Un bot relève un joueur déconnecté.
- **Règles** (`regles.ts`) : décompte, manches chronométrées, premier à
  2 manches (3 au plus), départage aux dégâts infligés, chute = perte de
  25 % des PV max puis réapparition invulnérable.

## Personnages et cartes

| Personnage | Style | Traits |
|---|---|---|
| Mr Corbiceps | lourd, corps à corps | « oui, non, non, oui », uppercut Σ, ∏ chargé, contre « Non. », ultime en série |
| Mr Pricou | zone, projectiles | électrons, fiole → flaque ralentissante, aimant piège, propulsion, trou noir |
| Souheil Dictador | contrôle, pression | ballon qui rebondit, porte-voix (intimidé), décret (silence), discours (galvanisé / dominé) |
| Absolut Théodore | assassin, mobilité | triple saut, lampe (ébloui), passe-muraille (marqué), grappin, fil piège, « Absolut Cinema » |

Cartes : salle d'entraînement (plateau et trois plateformes), labo de
physique (deux paillasses séparées par un vide), toit de l'usine (deux
toits à hauteurs différentes, cheminée, passerelles).

**Ajouter un personnage** : ses données dans `noyau/contenu/persos/`
(stats, coups, entités), son apparence dans `client/persos/` (squelette,
poses, animations calées sur les frames des coups, effets, dessins des
entités), puis l'inscrire dans les deux registres (`contenu/index.ts`,
`client/persos/index.ts`) et sa présentation dans `client/catalogue.ts`.
Les tests vérifient la cohérence des données, que chaque coup a son
animation et chaque entité son dessin. **Ajouter une carte** : ses blocs
dans `noyau/contenu/cartes/`, son décor (facultatif) dans
`client/rendu/decor.ts`.

## Présentation

- **Sons** (`client/son/sons.ts`) : synthétisés par Web Audio, sans aucun
  fichier ; chaque événement de la simulation choisit sa recette d'après
  les données (dégâts, entité qui explose, coup qui coûte la jauge…), avec
  panoramique selon la position à l'écran.
- **Menu** (Échap) : volume et secousses d'écran (gardés dans le
  navigateur) ; à l'entraînement, pause et « Recommencer ».
- **Manches** : fondu au noir entre deux manches, halo doré quand l'ultime
  est prêt, tableau des résultats (manches, dégâts) en fin de partie.
- **Décors** (`client/rendu/decor.ts`) : un thème par carte, plans en
  parallaxe, quelques détails animés.
- **Aperçu des menus** (`client/apercu.ts`) : au choix du combattant, une
  vraie petite simulation où il enchaîne ses coups sur un mannequin,
  dessinée par le rendu du jeu (Pixi chargé après l'affichage de la page,
  rien si l'utilisateur préfère réduire les animations).

## Multijoueur

- **Serveur autoritaire** (`jeu/serveur`) : un processus Node séparé, une
  horloge à 60 ticks/s pour toutes les parties. Les clients n'envoient que
  leurs entrées (champ de bits numéroté) ; le serveur les consomme une par
  tick (répète la dernière si rien n'arrive, fusionne si la file
  s'allonge) et diffuse l'état complet ~30 fois par seconde, en binaire
  (varints, < 1 Ko à trois combattants).
- **Client** (`jeu/client/reseau`) : son propre combattant est prédit
  (même code que le serveur, rejoué depuis chaque état officiel), les
  autres sont interpolés un peu dans le passé ; reconnexion automatique
  avec reprise de sa place.
- **Identité** : le site signe un ticket de deux minutes (HMAC-SHA256,
  secret de session, préfixe propre au jeu, `src/app/jeu/actions.ts`) ; le
  serveur de jeu le vérifie, sans base de données ni cookie.
- **Salons** (en mémoire) : code de 4 caractères, hôte, 4 places, bots,
  spectateurs ; un joueur déconnecté garde sa place pendant la partie.
- **Pages** : `/jeu` (accueil), `/jeu/entrainement`, `/jeu/salon/CODE`
  (lien à partager), `/jeu/regarder/CODE` (spectateur, projecteur).
- **Spectateur** : aucune prise sur la partie ; la caméra cadre le groupe
  des combattants et zoome selon leur écartement, l'interface grandit avec
  l'écran, les boutons et le curseur s'effacent quand la souris ne bouge
  plus, et l'écran d'attente affiche l'adresse pour rejoindre. Il suit
  les parties successives du salon sans rien faire.

## Commandes

```bash
npm run jeu:test     # tests du jeu
npm run jeu:dev      # serveur de jeu sur 127.0.0.1:4270 (JEU_PORT)
npm run dev          # site ; /jeu exige JEU_ACTIF=tous (ou admins) dans .env
```

En développement, le site et le serveur de jeu tournent côte à côte : le
navigateur rejoint directement `ws://127.0.0.1:4270/ws/jeu` si
`JEU_WS_URL` le dit (dans `.env`) ; en production, il passe par nginx sur
la même origine. Les deux lisent le même `SESSION_SECRET`.

Au clavier : ZQSD ou flèches, Espace (saut), Maj (dash), J/X (attaque),
K/C (spécial), L/V (ultime), H (boîtes de coups). Manette : stick ou
croix, A saut, X attaque, B spécial, Y ultime, gâchettes dash.

## Phase 0 : constats (23 septembre 2026)

Vérifiés dans Chromium, derrière nginx, avec la CSP de `deploy/nginx-mp2ifsm.conf` :

- **Pixi v8 exige `import "pixi.js/unsafe-eval"`** : sans lui, le rendu
  refuse de démarrer (la CSP interdit `new Function`). Avec : WebGL2,
  aucune violation de CSP.
- Pixi ne crée des workers `blob:` que pour charger des textures : le
  jour où il y en aura, régler `loadTextures.config.preferWorkers = false`
  (ou adapter la CSP).
- Pixi n'est chargé que par `/jeu` (import dynamique) ; les autres pages
  sont inchangées.
- WebSocket vers `/ws/jeu` en même origine via nginx : accepté par
  `connect-src 'self'` ; une connexion directe au port 4270 est bloquée.
  Bloc nginx validé, à installer lors du déploiement (avec
  `wss://mp2ifsm.com` dans `connect-src` pour Safari) :

```nginx
location = /ws/jeu {
    proxy_pass http://127.0.0.1:4270;
    proxy_http_version 1.1;
    proxy_set_header Upgrade    $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host       $host;
    proxy_read_timeout 75s;
    proxy_buffering    off;
}
location = /ws/jeu/sante {
    allow 127.0.0.1;
    allow ::1;
    deny all;
    proxy_pass http://127.0.0.1:4270;
}
```
