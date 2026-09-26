# Ajouter un personnage

Un personnage, c'est **deux fichiers** et **deux lignes d'inscription** :

| Quoi | Où | Contenu |
|---|---|---|
| Gameplay | `noyau/contenu/persos/<id>.ts` | stats, coups, entités, fiche de présentation — uniquement des données |
| Apparence | `client/persos/<id>.ts` | squelette dessiné, palettes, poses, animations, effets, dessins des entités |
| Inscription | `noyau/contenu/index.ts` (`PERSOS`) et `client/persos/index.ts` (`APPARENCES`) | une ligne chacun |

Le moteur ne connaît aucun personnage : rien d'autre à toucher. Si un
comportement manque (nouveau statut, nouveau type d'entité), il s'ajoute
au moteur **de façon générique**, avec ses tests, jamais sous la forme
`if (perso === …)` — `tests/frontieres.test.ts` l'interdit.

Le plus simple est de partir d'un personnage proche : **Souheil**
(`souheil.ts`, des deux côtés) est le plus court et utilise un peu de
tout (projectile qui rebondit, zone, statuts, ultime à effet de zone).

## Étapes

1. **Gameplay.** Copier un fichier de `noyau/contenu/persos/`, changer
   `id` (minuscules), `nom`, `fiche`, `stats`, puis les coups.
2. **Apparence.** Copier le fichier correspondant de `client/persos/` :
   proportions, au moins **deux palettes** (duels miroirs), dessins des
   pièces, poses, une animation **par coup**, effets, un dessin **par
   entité**.
3. **Inscrire** le personnage dans les deux registres.
4. **Vérifier** : `npm run jeu:test` (données cohérentes, chaque coup
   animé, chaque entité dessinée, la démonstration des menus fonctionne,
   pas de duel à sens unique), puis `npm run jeu:equilibrage`.
5. **Jouer** : `/jeu/entrainement` contre le mannequin (touche H : boîtes
   de coups), puis contre des bots, puis entre humains.

## Unités et conventions

- **60 ticks par seconde** ; toutes les durées sont en ticks (frames).
- Positions et vitesses en **centièmes de pixel** : écrire `px(8.6)` pour
  8,6 px par tick. Les aides `frappe()`, `elan()` et `touche()`
  (`contenu/outils.ts`) prennent des pixels et convertissent.
- Coordonnées d'un coup : `x` **devant** le personnage, `y` **au-dessus
  de ses pieds** ; la hitbox est centrée sur ce point.
- Angles en degrés : 0 = droit devant, 90 = vers le haut, négatif = vers
  le bas.
- Recul : `recul + croissance × PV manquants`, divisé par le `poids`
  (100 = normal).
- Une touche sans recul ni hitstun est une « égratignure » : elle blesse
  (ou pose un statut) sans interrompre la cible.

## Briques disponibles

**Coups** (`CoupDef`) : `hitboxes` (avec `groupe` pour les coups
multiples), `mouvement` (élans imposés), `suite` (enchaînement sur
nouvel appui), `surTouche` (coup suivant si ça touche : ultimes en deux
temps), `armure`, `invulnerable`, `contre` (+ `riposte`), `charge`
(bouton tenu), `recharge`, `jauge` (coût d'ultime), `ultime`,
`unParSaut`, `atterrissage`, `annulable`, `controleAir`, `statutsSoi`,
`entites` (ce que le coup fait apparaître, à quelle frame).

Emplacements : `neutre`, `cote`, `haut`, `bas`, `air_neutre`,
`air_cote`, `air_haut`, `air_bas`, `special_neutre`, `special_cote`,
`special_haut`, `special_bas`, `ultime`. Un emplacement absent retombe
sur un plus général (`air_bas` → `air_neutre`).

**Entités** (`EntiteDef`) : projectile (`vx`, `vy`, `gravite`), rapport
aux murs (`solides` : traverser, arrêter, rebondir, détruire), zone
périodique (`periode`), piège (`declencheur`), `attraction`, `grappin`,
`bouclier`, `suitLanceur`, nombre maximal (`max`), explosion en fin de
vie (`surFin`), `touche` (`radial` : repousse depuis le centre).
Un objet qui heurte le décor doit naître au-dessus des pieds du lanceur
(`y ≥ h / 2`) — un test le vérifie.

**Statuts** (`statuts.ts`) : ralenti, étourdi, silence, intimidé,
galvanisé, marqué, armure, apesanteur, ébloui, dominé.

## Repères d'équilibrage

- PV entre 1300 (fragile, mobile) et 1550 (lourd).
- Un coup rapide (sortie ≤ 5 frames) fait 20 à 40 ; un gros coup lent
  (sortie ≥ 10 frames) 90 à 120 ; un ultime qui touche en entier 290
  (Théodore) à 470 (Corbiceps) — il coûte une jauge pleine.
- `npm run jeu:equilibrage -- 3 60` : viser 40 à 60 % de victoires au
  total, aucun duel au-delà de 65/35. Les bots exploitent mal la
  mobilité et les pièges : un personnage d'esquive peut être un peu en
  dessous chez eux et très bien entre humains.

## Mise en production

- Les navigateurs et le serveur comparent une **empreinte des données**
  (`noyau/contenu/empreinte.ts`) à la connexion : après un déploiement,
  une page restée ouverte est priée de se recharger. Rien à faire pour
  un personnage, une carte ou un réglage.
- Une modification du **moteur** (règles codées, format de l'état,
  messages) demande d'augmenter `VERSION_PROTOCOLE`
  (`protocole/messages.ts`). Dans `protocole/etat.ts`, la liste des
  types ne se réordonne jamais : on ajoute à la fin.
- Idée pour plus tard : un personnage « en test » réservé aux admins. Le
  ticket d'identité porte déjà le rôle ; il resterait à le transmettre au
  salon et à filtrer le choix côté serveur.
