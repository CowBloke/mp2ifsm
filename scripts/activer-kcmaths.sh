#!/usr/bin/env bash
# Active les transferts kcmaths : demande le jeton, verifie le fichier PHP
# chez kcmaths, l'ecrit dans le .env de production, pousse la branche sur
# main puis attend que le deploiement approuve soit en ligne.
#
#   bash scripts/activer-kcmaths.sh
#
# Relancer le script avec un nouveau jeton suffit pour le changer.
set -euo pipefail

readonly ENV_FILE=/home/cowbloke/projects/apps/mp2ifsm/.env
readonly URL=https://kcmaths.com/api/mp2ifsm.php
readonly CURRENT=/var/lib/mp2ifsm-deploy/current
readonly ACTIONS=https://github.com/CowBloke/mp2ifsm/actions
repo=$(cd "$(dirname "$0")/.." && pwd)

read -rsp "Jeton kcmaths (64 caractères hexadécimaux) : " token; echo
if [[ ! $token =~ ^[0-9a-f]{64}$ ]]; then
  echo "Jeton invalide : utilisez la sortie de « openssl rand -hex 32 »." >&2
  exit 1
fi

# delta 0 est refuse (400) par le PHP, mais seulement APRES le controle du
# jeton : 400 prouve que le fichier est en place et que le jeton est bon,
# sans deplacer aucun KC coin.
code=$(curl -s -o /dev/null -w '%{http_code}' -m 15 -X POST "$URL" \
  -H "authorization: Bearer $token" -H 'content-type: application/json' \
  -d '{"ref":"verification","email":"verification@mp2ifsm.invalid","delta":0}' || true)
case $code in
  400) echo "kcmaths : fichier en place, jeton accepté." ; activer=1 ;;
  401) echo "kcmaths refuse ce jeton : vérifiez qu'il est identique dans le fichier PHP." >&2; exit 1 ;;
  404) echo "kcmaths : $URL n'existe pas encore (fichier PHP pas installé)." ;;
  *)   echo "kcmaths : réponse inattendue (HTTP ${code:-aucune})." ;;
esac
if [[ -z ${activer:-} ]]; then
  read -rp "Déployer le code quand même, transferts désactivés ? [o/N] " rep
  [[ $rep == [oO] ]] || exit 1
fi

if [[ -n ${activer:-} ]]; then
  tmp=$(mktemp "$ENV_FILE.XXXXXX")
  chmod 600 "$tmp"
  grep -v -E '^KCMATHS_API_(URL|TOKEN)=' "$ENV_FILE" > "$tmp" || true
  printf 'KCMATHS_API_URL=%s\nKCMATHS_API_TOKEN=%s\n' "$URL" "$token" >> "$tmp"
  mv "$tmp" "$ENV_FILE"
  echo "Jeton enregistré dans $ENV_FILE."
fi
unset token

sha=$(git -C "$repo" rev-parse HEAD)
deja_en_ligne=0
[[ $(readlink -f "$CURRENT") == */"$sha" ]] && deja_en_ligne=1

if (( ! deja_en_ligne )); then
  # Avance rapide uniquement : refuse si main a bouge entre-temps.
  if ! git -C "$repo" push origin "HEAD:main"; then
    echo "Push refusé (main a avancé ou est protégée). Ouvrez une PR :" >&2
    echo "  https://github.com/CowBloke/mp2ifsm/compare/main...$(git -C "$repo" branch --show-current)" >&2
    exit 1
  fi
  echo
  echo "Approuvez le déploiement « production » quand les tests sont verts :"
  echo "  $ACTIONS"
  echo "Attente de la mise en ligne de ${sha:0:7} (Ctrl+C pour arrêter d'attendre)…"
  until [[ $(readlink -f "$CURRENT") == */"$sha" ]]; do sleep 20; done
  # Le deploiement redemarre le service, qui relit le .env.
else
  echo "${sha:0:7} est déjà en ligne : redémarrage pour relire le .env."
  sudo systemctl restart mp2ifsm.service
fi

for _ in {1..30}; do
  curl -fsS -o /dev/null -m 5 http://127.0.0.1:4260/connexion && break
  sleep 2
done
curl -fsS -o /dev/null -m 5 http://127.0.0.1:4260/connexion \
  && echo "En ligne : https://mp2ifsm.com/profil" \
  || { echo "Le service ne répond pas : journalctl -u mp2ifsm -n 50" >&2; exit 1; }
