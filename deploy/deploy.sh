#!/usr/bin/env bash
# 배포 — deploy 계정으로 실행한다 (ADR-0027).
#
#   deploy/deploy.sh               origin/main 최신으로 (이미 그 버전이면 아무것도 안 한다)
#   deploy/deploy.sh v0.2.0        특정 태그·커밋으로
#   deploy/deploy.sh --auto        타이머용. 바뀐 게 없거나 직전에 실패한 버전이면 조용히 끝낸다
#   deploy/deploy.sh --rebuild     같은 버전을 새로 빌드 (재동기 뒤 sitemap 다시 굽기)
#   deploy/deploy.sh --rollback    직전 릴리스로 되돌린다 (빌드 없음)
#
# 릴리스마다 새 폴더에 빌드하고, 다 되면 `current` 링크를 바꿔 재시작한다. 빌드하는 동안
# 서비스는 옛 폴더에서 그대로 돈다. 새 버전이 헬스 체크에 실패하면 옛 폴더로 되돌린다.
set -euo pipefail

APP="${APP:-/opt/buildfit}"
ENV_FILE="${ENV_FILE:-/etc/buildfit/buildfit.env}"
SERVICE="${SERVICE:-buildfit}"
KEEP="${KEEP:-3}"
REPO="$APP/repo"
RELEASES="$APP/releases"
STATE="$APP/.deploy"

log() { echo "[deploy] $*"; }

mkdir -p "$RELEASES" "$STATE"
# 타이머와 손 배포가 겹치지 않게 한다
exec 9>"$STATE/lock"
flock -n 9 || { log "다른 배포가 진행 중이에요"; exit 0; }

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
PORT="${PORT:-3200}"
HEALTH_URL="http://127.0.0.1:$PORT/healthz"

healthy() {
  for _ in $(seq 1 20); do
    curl -fsS --max-time 3 -o /dev/null "$HEALTH_URL" && return 0
    sleep 1
  done
  return 1
}

restart() {
  # 잠금 핸들(9)을 넘기지 않는다 — 넘어가면 배포가 끝나도 잠금이 안 풀린다
  sudo -n /usr/bin/systemctl restart "$SERVICE" 9>&-
  healthy
}

# readlink -f 는 없는 경로도 그대로 돌려준다 — 링크가 있을 때만 읽는다
current_dir() { [[ -L "$APP/current" ]] && readlink -f "$APP/current" || true; }
current_sha() { cat "$(current_dir)/.release-sha" 2>/dev/null || true; }

switch_to() {
  ln -sfn "$1" "$APP/current.new"
  mv -T "$APP/current.new" "$APP/current"
}

MODE="ref"
REF="origin/main"
case "${1:-}" in
  --auto) MODE="auto" ;;
  --rebuild) MODE="rebuild" ;;
  --rollback) MODE="rollback" ;;
  "") ;;
  *) REF="$1" ;;
esac

if [[ "$MODE" == "rollback" ]]; then
  PREV="$(cat "$STATE/previous" 2>/dev/null || true)"
  [[ -n "$PREV" && -d "$PREV" ]] || { log "되돌릴 이전 릴리스가 없어요"; exit 1; }
  NOW="$(current_dir)"
  switch_to "$PREV"
  if restart; then
    echo "$NOW" > "$STATE/previous"
    log "되돌렸어요: $(basename "$PREV")"
    exit 0
  fi
  log "이전 릴리스도 헬스 체크 실패 — 원래대로 둡니다"
  switch_to "$NOW"; restart || true
  exit 1
fi

[[ "$REF" =~ ^[A-Za-z0-9._/-]+$ ]] || { log "잘못된 ref: $REF"; exit 1; }
git -C "$REPO" fetch --quiet --tags --prune origin
if [[ "$MODE" == "rebuild" ]]; then
  TARGET="$(current_sha)"
  [[ -n "$TARGET" ]] || { log "지금 배포된 버전이 없어요"; exit 1; }
else
  TARGET="$(git -C "$REPO" rev-parse "${REF}^{commit}")"
fi

if [[ "$MODE" == "auto" ]]; then
  [[ "$TARGET" == "$(current_sha)" ]] && exit 0
  # 실패한 버전을 2분마다 다시 빌드하지 않는다. 새 커밋이 오거나 손으로 돌리면 다시 한다
  [[ "$TARGET" == "$(cat "$STATE/failed" 2>/dev/null || true)" ]] && exit 0
elif [[ "$MODE" == "ref" && "$TARGET" == "$(current_sha)" ]]; then
  log "이미 $(git -C "$REPO" describe --tags --always "$TARGET") 버전이에요 (--rebuild 로 다시 빌드)"
  exit 0
fi

LABEL="$(git -C "$REPO" describe --tags --always "$TARGET")"
DIR="$RELEASES/$(date +%Y%m%d-%H%M%S)-${TARGET:0:12}"
log "$LABEL 빌드 → $DIR"
mkdir -p "$DIR"

fail() {
  log "실패: $*"
  echo "$TARGET" > "$STATE/failed"
  rm -rf "$DIR"
  exit 1
}

git -C "$REPO" archive "$TARGET" | tar -x -C "$DIR" || fail "코드 꺼내기"
echo "$TARGET" > "$DIR/.release-sha"
echo "$LABEL" > "$DIR/.release-label"
cd "$DIR"
# 서비스가 도는 Node가 보안 하한 아래면 알린다 (ADR-0030). 멈추지는 않는다 — 배포를 막아도 옛 릴리스가
# 같은 Node에서 계속 돌 뿐이다. Node는 sudo로 올린다 (apt)
"${NODE_BIN:-/usr/bin/node}" scripts/node-floor.mjs || log "주의: 서비스 Node를 올려야 해요 ($("${NODE_BIN:-/usr/bin/node}" -v))"
npm ci --no-audit --no-fund --loglevel=error || fail "npm ci"
# 마이그레이션은 배포보다 먼저다 — 컬럼 추가는 옛 버전과 공존한다 (deployment.md §6)
npm run migrate --silent || fail "마이그레이션"
PARTS="$(psql "$DATABASE_URL" -tAc 'select count(*) from parts' 2>/dev/null || echo 0)"
if [[ "$PARTS" == "0" ]]; then
  log "카탈로그가 비어 있어 처음 적재합니다"
  npm run ingest --silent || fail "적재"
fi
# ★ NEXT_PUBLIC_SITE_URL 이 이 셸에 있어야 sitemap·robots 가 실제 도메인으로 구워진다 (deployment.md §2)
npm run build --silent || fail "빌드"
# 서비스 계정이 실행 중 캐시를 쓴다
chgrp -R "${SERVICE_GROUP:-buildfit}" apps/web/.next && chmod -R g+rwX apps/web/.next

PREV="$(current_dir)"
switch_to "$DIR"
if restart; then
  [[ -n "$PREV" && "$PREV" != "$DIR" ]] && echo "$PREV" > "$STATE/previous"
  rm -f "$STATE/failed"
  log "완료: $LABEL"
else
  log "새 버전이 헬스 체크에 실패 → 이전 릴리스로 되돌립니다"
  journalctl -u "$SERVICE" -n 30 --no-pager 2>/dev/null || true
  if [[ -n "$PREV" ]]; then
    switch_to "$PREV"
    restart || log "이전 릴리스도 실패! 손으로 확인해야 해요 (journalctl -u $SERVICE)"
  fi
  fail "헬스 체크"
fi

# 지금 것·직전 것 말고는 최근 KEEP 개만 남긴다
KEEP_PREV="$(cat "$STATE/previous" 2>/dev/null || true)"
ls -1dt "$RELEASES"/*/ 2>/dev/null | sed 's:/$::' | tail -n +"$((KEEP + 1))" | while read -r old; do
  [[ "$old" == "$DIR" || "$old" == "$KEEP_PREV" ]] && continue
  rm -rf "$old"
done
