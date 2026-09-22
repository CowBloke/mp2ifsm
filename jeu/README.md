# Jeu de combat de la classe — prototype

Phase 1 : un mannequin (simple boîte) se déplace, saute, double-saute et
dashe dans une arène fermée, en local dans le navigateur. Ni personnage,
ni combat, ni multijoueur pour l'instant.

## Organisation

```
jeu/noyau/    simulation pure, en entiers, 60 ticks/s (ni DOM, ni Node, ni Pixi, ni React)
jeu/client/   rendu PixiJS, clavier, caméra ; point d'entrée unique : monterJeu()
jeu/serveur/  serveur Node séparé (phase 0 : santé + écho WebSocket)
jeu/tests/    tests sans navigateur (node:test)
src/app/jeu/  page /jeu du site : un conteneur, rien d'autre
```

`jeu/tests/frontieres.test.ts` fait échouer les tests si ces frontières
sont franchies.

## Commandes

```bash
npm run jeu:test     # tests du jeu (physique, horloge, caméra, serveur, frontières)
npm run jeu:dev      # serveur de jeu sur 127.0.0.1:4270 (JEU_PORT), rechargement auto
npm run dev          # site ; /jeu exige JEU_ACTIF=tous (ou admins) dans .env
```

Contrôles : ← → ou Q D, saut sur Espace, ↑ ou Z (deux fois en l'air), dash sur Maj.

## Constats de la phase 0 (23 septembre 2026)

Vérifiés dans Chromium, derrière nginx, avec la CSP de `deploy/nginx-mp2ifsm.conf` :

- **Pixi v8 exige `import "pixi.js/unsafe-eval"`** : sans lui, le rendu
  refuse de démarrer, car la CSP interdit `new Function`. Avec ce module :
  WebGL2, aucune violation de CSP.
- Pixi ne crée des workers `blob:` que pour charger des textures : quand il y
  en aura, régler `loadTextures.config.preferWorkers = false` (ou adapter la CSP).
- Pixi n'est chargé que par `/jeu` (import dynamique, ≈ 125 Ko gzip) ;
  les autres pages sont inchangées.
- WebSocket de la page vers `/ws/jeu` (même origine, via nginx) : accepté
  par `connect-src 'self'`. Une connexion directe au port 4270 est bloquée
  par la CSP : en production, il faut passer par nginx.
- Bloc nginx validé (à ajouter à la phase de déploiement, avec
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
