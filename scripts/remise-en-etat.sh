#!/usr/bin/env bash
# Remet le Pi en cohérence avec le dépôt, sans rien supprimer de non fusionné :
#   1. applique db/schema-kcmaths.sql (additif, rejouable) ;
#   2. réinstalle les scripts de déploiement root qui diffèrent du dépôt ;
#   3. retire le worktree mp2ifsm-colloscope-update, déjà fusionné.
#
#   bash scripts/remise-en-etat.sh
#
# Demande le mot de passe sudo pour l'étape 2 seulement. Chaque étape
# affiche ce qu'elle fait ; relancer le script ne change plus rien.
set -euo pipefail

readonly REPO=/home/cowbloke/projects/apps/mp2ifsm
readonly ANCIEN_WORKTREE=/home/cowbloke/projects/mp2ifsm-colloscope-update
readonly ANCIENNE_BRANCHE=fix/colloscope-s1-update
cd "$REPO"

echo "== 1. Migration kcmaths"
set -a
# shellcheck disable=SC1091
source .env
set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f db/schema-kcmaths.sql
psql "$DATABASE_URL" -At -c "select 'table kcmaths_transfer : ' || coalesce(to_regclass('kcmaths_transfer')::text, 'ABSENTE')"

echo "== 2. Scripts de déploiement installés"
installer() { # source cible mode
  if cmp -s "$1" "$2"; then
    echo "à jour : $2"
  else
    echo "réinstallation : $2"
    sudo install -o root -g root -m "$3" "$1" "$2"
  fi
}
installer deploy/build-release.sh /usr/local/libexec/mp2ifsm-build-release 0755
installer deploy/mp2ifsm-auto-deploy /usr/local/sbin/mp2ifsm-auto-deploy 0755

echo "== 3. Ancien worktree"
if [[ -d $ANCIEN_WORKTREE ]]; then
  # Seul un node_modules non suivi y traîne : on refuse s'il y a autre chose.
  autres=$(git -C "$ANCIEN_WORKTREE" status --porcelain | grep -v '^?? node_modules/\?$' || true)
  if [[ -n $autres ]]; then
    echo "conservé, modifications présentes :" >&2
    echo "$autres" >&2
  elif ! git merge-base --is-ancestor "$(git -C "$ANCIEN_WORKTREE" rev-parse HEAD)" origin/main; then
    echo "conservé : $ANCIENNE_BRANCHE n'est pas fusionnée dans origin/main" >&2
  else
    git worktree remove --force "$ANCIEN_WORKTREE"
    git branch -d "$ANCIENNE_BRANCHE"
    echo "retiré : $ANCIEN_WORKTREE"
  fi
else
  echo "déjà retiré"
fi
git worktree prune

echo "Terminé."
