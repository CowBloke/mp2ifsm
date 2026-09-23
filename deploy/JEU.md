# Mise en production du jeu (Taupe Fighter)

> **Pour Claude Code sur le Raspberry Pi, et pour CowBloke.** Ce document a
> été préparé par la session Claude Code de MBNY, qui a développé le jeu
> (branche `feature/jeu-phase-0`). Tout ce qui suit demande les droits root
> sur le Pi : **demande l'accord de CowBloke avant chaque étape marquée 🔒**,
> et ne contourne jamais le circuit habituel (`main` → `production` →
> déploiement automatique). Rien ici ne se déclenche tout seul.

## En bref

- Le jeu vit sous `/jeu` (pages Next.js du site) et s'appuie sur un
  **serveur de jeu séparé** : Node, WebSocket, `127.0.0.1:4270`, exposé par
  nginx sous `/ws/jeu` (même origine que le site).
- Il est **caché par défaut** : tant que `JEU_ACTIF` est vide, `/jeu`
  répond 404, l'icône d'accueil n'apparaît pas et le site ne délivre aucun
  ticket de jeu. Le code peut donc être fusionné et déployé sans que rien
  ne change pour les élèves.
- Identité : le site signe un ticket de deux minutes (HMAC-SHA256 avec
  `SESSION_SECRET`, préfixe propre au jeu) ; le serveur de jeu le vérifie.
  **Aucun nouveau secret**, aucune table, aucune migration.
- Coût : environ 5 µs de calcul par tick pour une partie à quatre,
  quelques dizaines de Mo de mémoire, 60 salons au plus.

## Ce que contient le dépôt

| Fichier | Rôle |
|---|---|
| `deploy/mp2ifsm-jeu.service` | Unité systemd du serveur de jeu (même release que le site, loopback, durcie, réseau limité à localhost). |
| `deploy/nginx-mp2ifsm.conf` | Deux blocs `location` (`/ws/jeu`, `/ws/jeu/sante` réservé à la machine) et `connect-src` étendu aux `wss://`. |
| `deploy/mp2ifsm-auto-deploy` | Redémarre aussi le serveur de jeu **s'il est installé**, vérifie sa santé, et le reprend dans le retour arrière. Sans l'unité, comportement inchangé. |
| `deploy/build-release.sh` | Lance aussi `npm run jeu:test` : un jeu cassé bloque le déploiement. |
| `.env.example` | Variables `JEU_*` documentées. |

Validé avant envoi : `nginx -t` sur la configuration, passage réel d'un
WebSocket à travers ce vhost (101 pour `https://mp2ifsm.com` et
`https://www.mp2ifsm.com`, 403 pour une autre origine), santé servie en
local mais refusée à une requête portant l'en-tête de Cloudflare, `bash -n`
sur les scripts.

## Vérifications préalables (lecture seule, sans accord nécessaire)

```bash
/usr/local/bin/node --version        # ≥ 20.12 attendu
systemctl cat mp2ifsm.service        # la référence : l'unité du jeu la calque
diff /usr/local/sbin/mp2ifsm-auto-deploy       <dépôt>/deploy/mp2ifsm-auto-deploy
diff /usr/local/libexec/mp2ifsm-build-release  <dépôt>/deploy/build-release.sh
diff /etc/nginx/sites-available/mp2ifsm         <dépôt>/deploy/nginx-mp2ifsm.conf
```

Les `diff` ne doivent montrer **que** les ajouts du jeu. Si la version
installée a divergé du dépôt, ne pas écraser : reporter les seuls ajouts
et le signaler.

Côté Cloudflare : les WebSockets doivent être activés pour la zone
(Network → WebSockets, actif par défaut) ; le tunnel les transmet tel quel.
Si `www.mp2ifsm.com` n'est pas redirigé vers `mp2ifsm.com`, prévoir
`JEU_ORIGINES=https://www.mp2ifsm.com` (étape 2).

## Ordre d'installation

**0. Fusion** — par MBNY, via une PR vers `main`, puis approbation de
`production` comme d'habitude. Le jeu arrive caché.

**1. 🔒 Scripts de déploiement**, **après** le premier déploiement qui
contient le jeu (le nouveau `build-release.sh` appelle `npm run jeu:test`,
qui n'existe pas dans une release plus ancienne). Comme décrit dans le
README principal (ils doivent rester détenus par root) :

```bash
sudo install -o root -g root -m 0755 deploy/build-release.sh /usr/local/libexec/mp2ifsm-build-release
sudo install -o root -g root -m 0755 deploy/mp2ifsm-auto-deploy /usr/local/sbin/mp2ifsm-auto-deploy
```

Dès lors, `npm run jeu:test` fait partie de la validation.

**2. 🔒 Variables** dans `/home/cowbloke/projects/mp2ifsm/.env` :

```
JEU_ACTIF=                    # vide pour l'instant : jeu caché
JEU_PORT=4270
JEU_HOTE=                     # vide : loopback uniquement
JEU_ORIGINES=                 # https://www.mp2ifsm.com si www n'est pas redirigé
JEU_WS_URL=                   # vide : même origine, via nginx
```

`PUBLIC_ORIGIN=https://mp2ifsm.com` et `SESSION_SECRET` existent déjà et
servent tels quels.

**3. 🔒 nginx.** Reporter dans `/etc/nginx/sites-available/mp2ifsm` les deux
blocs `location` du jeu et la nouvelle ligne `Content-Security-Policy` (ou
recopier le fichier du dépôt si le `diff` ne montrait que ces ajouts),
puis :

```bash
nginx -t && systemctl reload nginx
```

**4. 🔒 Service du jeu**, une fois que la release active
(`/var/lib/mp2ifsm-deploy/current`) contient `jeu/serveur/main.ts` :

```bash
install -o root -g root -m 0644 deploy/mp2ifsm-jeu.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now mp2ifsm-jeu
```

Contrôles attendus :

```bash
journalctl -u mp2ifsm-jeu -n 20
# « serveur de jeu : ws://127.0.0.1:4270/ws/jeu (origines acceptées : https://mp2ifsm.com…) »
curl -s http://127.0.0.1:4270/ws/jeu/sante        # {"ok":true,…}
ss -ltnp | grep 4270                              # 127.0.0.1 seulement
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: mp2ifsm.com' \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' \
  -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H 'Origin: https://mp2ifsm.com' \
  http://127.0.0.1/ws/jeu                         # 101
```

**5. 🔒 Ouverture aux admins** : `JEU_ACTIF=admins`, puis
`systemctl restart mp2ifsm` (Next lit l'environnement au démarrage).
Depuis un navigateur connecté en admin : icône manette à côté de
« Groupe » sur l'accueil → `/jeu` → « Créer un salon » devient cliquable
(connecté au serveur de jeu) ; aucune erreur CSP dans la console. De
l'extérieur, `https://mp2ifsm.com/ws/jeu/sante` doit répondre 403.

> ⚠️ À signaler, hors jeu : derrière le tunnel, nginx voit toutes les
> requêtes venir de `127.0.0.1`. Le `allow 127.0.0.1; deny all;` du bloc
> `/api/cron/` existant ne filtre donc pas le trafic extérieur (le
> `CRON_TOKEN` reste la vraie protection). Le bloc de santé du jeu ajoute
> pour cela un refus des requêtes portant `CF-Connecting-IP` ; le même
> ajout conviendrait à `/api/cron/`, à décider par CowBloke.

**6. 🔒 Ouverture à tous** : `JEU_ACTIF=tous`, `systemctl restart mp2ifsm`.

## Retour arrière

- **Cacher le jeu** : `JEU_ACTIF=` puis `systemctl restart mp2ifsm`. `/jeu`
  redevient 404, l'icône disparaît, plus aucun ticket n'est délivré ; le
  serveur de jeu peut rester en place, inerte.
- **Retirer le serveur de jeu** : `systemctl disable --now mp2ifsm-jeu`,
  supprimer l'unité, `systemctl daemon-reload`. Le script de déploiement
  l'ignore dès qu'elle n'est plus installée.
- Les blocs nginx peuvent rester : sans serveur derrière, `/ws/jeu`
  répond 502.

## Bon à savoir

- **Salons en mémoire** : chaque déploiement redémarre le serveur de jeu et
  met fin aux parties en cours. Les navigateurs se reconnectent, puis
  l'empreinte des données leur demande de recharger la page si le jeu a
  changé. Déployer hors des heures de jeu si possible.
- **Sécurité** : origine vérifiée, ticket signé exigé dans les 10 s,
  débits limités par connexion, messages de 4 Ko au plus ; écoute sur
  loopback, et l'unité systemd refuse tout trafic qui ne vient pas de la
  machine.
- **Journaux** : `journalctl -u mp2ifsm-jeu`.
- `npm run jeu:test` contient quelques tests réseau sensibles au temps
  (reconnexion, relève par un bot). S'ils échouaient sur le Pi sous
  charge, le signaler plutôt que les désactiver.
- Pour le reste du jeu : `jeu/README.md` ; pour ajouter des
  personnages : `jeu/PERSONNAGES.md`.
