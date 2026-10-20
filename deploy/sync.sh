#!/usr/bin/env bash
# 주간 OpenDB 재동기 — deploy 계정, 타이머가 부른다 (ADR-0025, deployment.md §5 2').
# 원본에 새 커밋이 있으면 재적재하고, 카테고리 sitemap 이 빌드 때 구워지므로 다시 빌드한다.
set -euo pipefail
APP="${APP:-/opt/buildfit}"
ENV_FILE="${ENV_FILE:-/etc/buildfit/buildfit.env}"

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

before="$(git -C "$OPENDB_PATH" rev-parse HEAD)"
cd "$APP/current"
npm run sync:opendb --silent
after="$(git -C "$OPENDB_PATH" rev-parse HEAD)"

if [[ "$before" != "$after" ]]; then
  echo "[sync] 재적재했어요 → sitemap 을 다시 굽습니다"
  bash "$APP/current/deploy/deploy.sh" --rebuild
fi
