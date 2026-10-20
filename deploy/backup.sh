#!/usr/bin/env bash
# 매일 DB 백업 — deploy 계정, 타이머가 부른다. 최근 KEEP 개만 남긴다.
#
# 카탈로그는 원본에서 다시 만들 수 있다. **사람이 넣은 것만 사본이 없다** — 어드민이 채운 스펙 값과
# 사용자 신고 (deployment.md §6). 통째로 떠도 압축하면 작아서 나누지 않는다.
# 되살리기: pg_restore --clean --if-exists -d "$DATABASE_URL" <파일>
set -euo pipefail
APP="${APP:-/opt/buildfit}"
ENV_FILE="${ENV_FILE:-/etc/buildfit/buildfit.env}"
KEEP="${KEEP:-14}"

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

mkdir -p "$APP/backups"
chmod 700 "$APP/backups"
OUT="$APP/backups/buildfit-$(date +%Y%m%d-%H%M%S).dump"
pg_dump -Fc --no-owner "$DATABASE_URL" > "$OUT"
echo "[backup] $OUT ($(du -h "$OUT" | cut -f1))"
ls -1t "$APP"/backups/*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
