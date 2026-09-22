#!/usr/bin/env bash
# CI와 같은 조건으로 테스트를 돌린다 — **빈 DB**.
#
# CI는 postgres 서비스를 새로 띄우므로 카탈로그가 비어 있다. 로컬에는 적재된
# 26,485건이 있어서, **실제 데이터에 기대는 테스트가 로컬에서만 통과한다.**
# 두 번 그랬다 (run 57·58).
#
# 사용: DATABASE_URL=postgres://... npm run test:empty-db
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL이 필요합니다 (관리 접속용)}"

NAME="buildfit_emptydb_$$"
# psql 인자 대신 URL을 그대로 쓴다. 자격증명이 URL 한 곳에만 있게 한다.
ADMIN_URL="${DATABASE_URL}"
TARGET_URL="$(node -e '
  const u = new URL(process.argv[1]); u.pathname = "/" + process.argv[2];
  process.stdout.write(u.toString());
' "$ADMIN_URL" "$NAME")"

cleanup() {
  psql "$ADMIN_URL" -q -c "drop database if exists \"$NAME\" with (force)" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "빈 DB $NAME 만드는 중..."
psql "$ADMIN_URL" -q -c "create database \"$NAME\""

echo "마이그레이션..."
DATABASE_URL="$TARGET_URL" npm run migrate --silent

echo "테스트 (CI=true, 카탈로그 0건)..."
DATABASE_URL="$TARGET_URL" CI=true npm test --workspaces --if-present

echo "프로덕션 빌드..."
DATABASE_URL="$TARGET_URL" npm run build --silent

echo "통과. CI와 같은 조건에서 깨지지 않는다."
