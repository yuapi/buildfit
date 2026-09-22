#!/bin/bash
# 새 클라우드 세션이 뜰 때 개발 환경을 세운다 — docs/handoff-guide.md §8.3을 자동으로.
#
# 컨테이너가 새로 뜨면 PostgreSQL 역할·DB, 적재된 카탈로그가 없다. 그러면
# DB 테스트가 **조용히 건너뛰고**(DATABASE_URL이 없으면 describe.skip), 앱 화면은
# 「불러올 수 없습니다」만 낸다. 둘 다 오류가 나지 않아 알아차리기 어렵다.
#
# 원칙
# - **멱등이다.** 이미 있으면 건너뛴다. 몇 번을 돌려도 같다
# - **필수와 선택을 가른다.** 의존성·DB·마이그레이션은 실패하면 크게 알린다.
#   원본 clone·적재는 네트워크가 막혀도 세션이 떠야 하므로 경고만 남긴다
# - 훅이 끝나면 컨테이너 상태가 캐시된다. 무거운 적재는 첫 세션에만 돈다
# - 비대화식이다
set -euo pipefail

# 로컬 개발 머신에서는 돌지 않는다 — 그쪽은 docker-compose.yml을 쓴다
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:?}"

# 로컬 전용 자격증명이다. 개인정보를 다루지 않으므로 비밀이 아니다 (ADR-0001).
# 이름을 바꿔 돌릴 수 있게 둔다 — 훅 자체를 검증할 때 쓴다.
DB_NAME="${BUILDFIT_DB_NAME:-buildfit}"
DB_URL="postgres://${DB_NAME}:${DB_NAME}@localhost:5432/${DB_NAME}"
OPENDB_DIR="$(cd "$CLAUDE_PROJECT_DIR/.." && pwd)/buildcores-open-db"

log() { echo "[session-start] $*" >&2; }

# --- 1) 의존성 ---------------------------------------------------------------
# npm ci가 아니라 install이다. 캐시된 컨테이너에서 node_modules를 재사용한다.
log "의존성 설치..."
npm install --no-audit --no-fund >&2

# --- 2) PostgreSQL -----------------------------------------------------------
# 이 환경에서는 도구 호출 사이에도 죽는다 (handoff-guide §8.5). 여기서는
# 세션 시작 시점만 책임진다.
if ! pg_isready -q; then
  log "PostgreSQL 시작..."
  pg_ctlcluster 16 main start >&2 || true
fi
for _ in $(seq 1 30); do
  pg_isready -q && break
  sleep 1
done
pg_isready -q || { log "★ PostgreSQL이 뜨지 않는다"; exit 1; }

# 슈퍼유저로 만든다 — 테스트가 격리 DB를 만들고 지우며(create/drop database),
# 마이그레이션이 pg_trgm 확장을 만든다 (handoff-guide §8.3).
role_exists=$(su postgres -c "psql -tAc \"select 1 from pg_roles where rolname = '${DB_NAME}'\"")
if [ "$role_exists" != "1" ]; then
  log "역할 ${DB_NAME} 생성..."
  su postgres -c "psql -q -c \"create role ${DB_NAME} login superuser password '${DB_NAME}'\"" >&2
fi
db_exists=$(su postgres -c "psql -tAc \"select 1 from pg_database where datname = '${DB_NAME}'\"")
if [ "$db_exists" != "1" ]; then
  log "DB ${DB_NAME} 생성..."
  su postgres -c "createdb -O ${DB_NAME} ${DB_NAME}" >&2
fi

# --- 3) 설정 -----------------------------------------------------------------
# 세션 전체에 넘긴다. 이게 없으면 DB 테스트가 조용히 건너뛴다.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo "export DATABASE_URL='${DB_URL}'"
    echo "export OPENDB_PATH='${OPENDB_DIR}'"
  } >> "$CLAUDE_ENV_FILE"
fi
[ -f .env ] || cp .env.example .env

# --- 4) 스키마 ---------------------------------------------------------------
log "마이그레이션..."
DATABASE_URL="$DB_URL" npm run migrate --silent >&2

# --- 5) 원본과 적재 (선택) ---------------------------------------------------
# 카탈로그가 이미 있으면 건너뛴다. 캐시된 컨테이너에서는 여기서 끝난다.
parts=$(PGPASSWORD="$DB_NAME" psql -h localhost -U "$DB_NAME" -d "$DB_NAME" -tAc "select count(*) from parts" 2>/dev/null || echo 0)
if [ "${parts:-0}" -gt 0 ]; then
  log "카탈로그 ${parts}건 — 적재 건너뜀"
else
  if [ ! -d "$OPENDB_DIR/open-db" ]; then
    log "원본 clone... (295MB)"
    if ! git clone --depth 1 --quiet https://github.com/buildcores/buildcores-open-db "$OPENDB_DIR" >&2; then
      log "⚠ 원본을 받지 못했다. 세션은 계속된다 — 앱 화면이 빈 카탈로그를 보인다."
      log "  나중에: git clone --depth 1 https://github.com/buildcores/buildcores-open-db $OPENDB_DIR && npm run ingest"
      exit 0
    fi
  fi
  log "적재... (20초 남짓)"
  if ! DATABASE_URL="$DB_URL" OPENDB_PATH="$OPENDB_DIR" npm run ingest --silent >&2; then
    log "⚠ 적재가 실패했다. 세션은 계속된다 — npm run ingest로 다시 돌린다."
    exit 0
  fi
fi

log "준비됨. DATABASE_URL이 세션에 들어 있다."
