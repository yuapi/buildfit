#!/usr/bin/env bash
# CI를 쓸 수 없을 때 같은 검사를 로컬에서 돌린다 — ADR-0029.
#
#   bash scripts/verify-local.sh [ref]          ref 기본값 HEAD
#   bash scripts/verify-local.sh --print-steps  돌릴 명령만 보인다
#
# ★ 명령을 이 파일에 따로 적지 않는다. .github/workflows/ci.yml의 `run:` 줄을 읽어
#   **그대로** 돌린다. 두 벌로 두면 한쪽만 고치는 일이 생긴다 (ci-gate.test.ts가 지킨다).
#
# 조건도 CI와 맞춘다.
# - 깨끗한 작업 트리: ref를 새 worktree로 꺼낸다. 작업 중인 파일·node_modules·.next가 섞이지 않는다
# - 빈 DB: 설치된 PostgreSQL 16으로 임시 폴더에 1회용 서버를 띄운다 (sudo 불필요).
#   **운영 DB(5432)는 건드리지 않는다** — 포트를 따로 고르고 소켓도 임시 폴더에 둔다
# - CI=true
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKFLOW="$ROOT/.github/workflows/ci.yml"

# ci.yml의 steps에서 `run:` 명령을 순서대로 뽑는다. 한 줄짜리만 쓴다 — 여러 줄(`run: |`)이
# 생기면 여기서 멈춘다. 모르는 모양을 조용히 건너뛰면 검사가 빠진다
steps() {
  local cmds
  cmds="$(sed -nE 's/^[[:space:]]*(- )?run:[[:space:]]*(.*)$/\2/p' "$WORKFLOW")"
  if grep -qE '^[|>]' <<<"$cmds"; then
    echo "ci.yml에 여러 줄 run이 있다. verify-local.sh가 읽을 수 있게 한 줄로 쓰거나 이 스크립트를 고친다" >&2
    exit 2
  fi
  printf '%s\n' "$cmds"
}

if [[ "${1:-}" == "--print-steps" ]]; then
  steps
  exit 0
fi

REF="${1:-HEAD}"
SHA="$(git -C "$ROOT" rev-parse --verify "$REF^{commit}")"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
[[ -x "$PGBIN/initdb" ]] || { echo "PostgreSQL 16이 없다 ($PGBIN). PGBIN=을 지정한다" >&2; exit 2; }

# CI의 postgres:16 이미지는 en_US.utf8이다. 로케일이 다르면 lower() 같은 문자 처리가 달라
# 검색 생성 컬럼 테스트가 깨진다 (C 로케일에서 실제로 깨졌다). 없으면 C.UTF-8로 내려간다
PG_LOCALE="${PG_LOCALE:-$(locale -a 2>/dev/null | grep -ixE 'en_US\.utf-?8' | head -1 || true)}"
PG_LOCALE="${PG_LOCALE:-C.UTF-8}"

WORK="$(mktemp -d)"
TREE="$WORK/tree"
PGDATA="$WORK/pg"
LOG="$WORK/verify.log"

cleanup() {
  "$PGBIN/pg_ctl" -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true
  git -C "$ROOT" worktree remove --force "$TREE" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

# 비어 있는 포트를 고른다. 5432(운영)는 처음부터 후보가 아니다
PORT=""
for p in $(seq 55432 55532); do
  if ! (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null; then PORT=$p; break; fi
done
[[ -n "$PORT" ]] || { echo "빈 포트를 찾지 못했다" >&2; exit 2; }

echo "== $SHA 를 깨끗한 작업 트리로 꺼낸다"
git -C "$ROOT" worktree add --detach --quiet "$TREE" "$SHA"

echo "== 1회용 PostgreSQL (127.0.0.1:$PORT)"
"$PGBIN/initdb" -D "$PGDATA" -U buildfit --auth=trust -E UTF8 --locale="$PG_LOCALE" >/dev/null
"$PGBIN/pg_ctl" -D "$PGDATA" -l "$WORK/pg.log" -w \
  -o "-p $PORT -k $WORK -c listen_addresses=127.0.0.1 -c fsync=off" start >/dev/null
"$PGBIN/createdb" -h 127.0.0.1 -p "$PORT" -U buildfit buildfit

export DATABASE_URL="postgres://buildfit@127.0.0.1:$PORT/buildfit"
export CI=true

started=$(date +%s)
results=()
status=0
cd "$TREE"
while IFS= read -r cmd; do
  [[ -z "$cmd" ]] && continue
  t0=$(date +%s)
  echo "== $cmd"
  if bash -c "$cmd" >>"$LOG" 2>&1; then
    results+=("통과 $(( $(date +%s) - t0 ))s  $cmd")
  else
    results+=("실패 $(( $(date +%s) - t0 ))s  $cmd")
    # 작업 폴더는 지워지므로 전체 로그를 남겨 둔다 — 끝부분만으로는 원인이 안 보인다
    KEEP="${TMPDIR:-/tmp}/buildfit-verify-${SHA:0:7}.log"
    cp "$LOG" "$KEEP"
    echo "-- 실패. 전체 로그: $KEEP"
    grep -E "FAIL|×|Error:" "$LOG" | head -30 || tail -40 "$LOG"
    status=1
    break
  fi
done < <(steps)

echo
echo "로컬 검증 $([[ $status -eq 0 ]] && echo 통과 || echo 실패) — $SHA ($(( $(date +%s) - started ))s, node $(node -v))"
printf '  %s\n' "${results[@]}"
exit $status
