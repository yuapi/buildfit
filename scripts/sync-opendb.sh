#!/usr/bin/env bash
# 업스트림 OpenDB를 다시 받아 재적재한다 — ADR-0025, 이슈 #64.
#
# 케이스 데이터(규칙 6·9·24)가 늘어나는 **유일한 자동 경로**다. 업스트림이 6시간마다
# 자동 동기로 채우는데, 세션 훅은 원본을 한 번 clone하고 끝이라 그 값이 들어오지 않았다.
#
# 적재는 `verify`로 돌린다 — 적재하면서 부품 id가 그대로인지 확인한다. 공유 링크가
# 부품 id를 담으므로 재적재가 id를 바꾸면 이미 뿌려진 링크가 전부 죽는다 (ADR-0012).
# 부품 행은 지우지 않는다 (명세 §5.6) — 업스트림에서 사라진 레코드도 링크가 산다.
#
# 사용: DATABASE_URL=... OPENDB_PATH=... npm run sync:opendb
#       새 커밋이 없으면 적재하지 않는다. 그래도 돌리려면 --force
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL이 필요합니다}"
: "${OPENDB_PATH:?OPENDB_PATH가 필요합니다 (OpenDB clone 경로)}"

force=0
[ "${1:-}" = "--force" ] && force=1

before=$(git -C "$OPENDB_PATH" rev-parse HEAD)
git -C "$OPENDB_PATH" pull --ff-only --quiet
after=$(git -C "$OPENDB_PATH" rev-parse HEAD)

if [ "$before" = "$after" ] && [ "$force" -eq 0 ]; then
  echo "원본에 새 커밋이 없다 ($(git -C "$OPENDB_PATH" log -1 --format='%cd' --date=short)). 적재하지 않는다."
  exit 0
fi

n=$(git -C "$OPENDB_PATH" rev-list --count "$before..$after")
echo "원본 ${before:0:8} → ${after:0:8} (커밋 ${n}개, $(git -C "$OPENDB_PATH" log -1 --format='%cd' --date=short))"
npm run verify --silent --workspace @buildfit/ingest

# 측정값은 적재 순간의 부품 이름에 잇는다 (ADR-0023) — 새 부품은 다시 돌려야 붙는다
echo "성능 측정값을 쓴다면 이어서: npm run ingest:benchmarks -- <opendata-latest.zip>"
