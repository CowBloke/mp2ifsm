#!/usr/bin/env bash
set -Eeuo pipefail

# Runs as the unprivileged application user inside a detached git worktree.
# The root-owned deploy helper invokes this file; never put privileged work here.

if [[ $# -ne 2 ]]; then
  echo "usage: build-release.sh RELEASE_DIR ENV_FILE" >&2
  exit 64
fi

release_dir=$(realpath "$1")
env_file=$(realpath "$2")

cd "$release_dir"

export NEXT_TELEMETRY_DISABLED=1
npm ci --no-audit --no-fund --cache /tmp/mp2ifsm-npm-cache
npm test
npm run jeu:test
npm run typecheck
NEXT_BUILD_DIR=.next-production npm run build

set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/functions.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema-portal.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema-proposals.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema-etudes.sql

# The privileged helper accepts only a release carrying this marker.
git rev-parse HEAD > .mp2ifsm-release-sha
