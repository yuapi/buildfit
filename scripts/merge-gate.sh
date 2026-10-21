#!/usr/bin/env bash
# PR을 검증된 상태로만 머지한다. CI를 쓸 수 없으면 로컬 검증으로 대신한다 — ADR-0029.
#
#   bash scripts/merge-gate.sh <PR 번호>
#
#   CI 통과        → 머지
#   CI 실패        → 머지하지 않고 멈춘다 (exit 1)
#   CI 도는 중     → 기다린다 (최대 WAIT_MIN분, 기본 40)
#   CI 쓸 수 없음  → PR이 머지된 모습을 로컬에서 CI와 같은 명령으로 검증한다.
#                    통과하면 결과를 PR 댓글로 남기고 머지, 실패하면 멈춘다
#
#   CI_GATE_DRILL=1  훈련. CI 결과를 본 뒤(실패면 여전히 멈춘다) 「쓸 수 없음」 경로를 탄다.
#                    우회 경로가 실제로 도는지 평소에 확인할 때 쓴다
#
# 머지는 merge 방식이다 (squash 아님, ADR-0024). 배포는 바뀌지 않는다 — main에 머지되면
# 서버 타이머가 2분 안에 당겨 빌드·헬스 체크·실패 시 되돌림까지 한다 (ADR-0027).
# CI는 머지 전 검사일 뿐 배포 경로에 들어 있지 않다.
set -euo pipefail

PR="${1:?사용: bash scripts/merge-gate.sh <PR 번호>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WAIT_MIN="${WAIT_MIN:-40}"

read -r HEAD_SHA BASE STATE HEAD_REF < <(gh pr view "$PR" --json headRefOid,baseRefName,state,headRefName \
  --jq '"\(.headRefOid) \(.baseRefName) \(.state) \(.headRefName)"')

# feature/는 머지하면서 지운다. 지우는 워크플로(delete-merged-branch.yml)도 Actions라
# CI가 멈추면 같이 멈춘다. release/·hotfix/는 두 곳에 머지해야 해서 남긴다 (ADR-0024)
MERGE_ARGS=(--merge)
[[ "$HEAD_REF" == feature/* ]] && MERGE_ARGS+=(--delete-branch)
[[ "$STATE" == "OPEN" ]] || { echo "PR #$PR 은 열려 있지 않다 ($STATE)"; exit 1; }

deadline=$(( $(date +%s) + WAIT_MIN * 60 ))
while :; do
  verdict="$(node "$ROOT/scripts/ci-gate.mjs" "$HEAD_SHA")"
  state="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).state)' "$verdict")"
  reason="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).reason)' "$verdict")"
  echo "[CI] $state — $reason"
  [[ "$state" != "pending" ]] && break
  if (( $(date +%s) > deadline )); then
    # 끝없이 도는 것도 쓸 수 없는 것이다
    state="unavailable"; reason="${WAIT_MIN}분 기다려도 끝나지 않았다"
    break
  fi
  sleep 30
done

# 쓸 수 없음 경로의 머지는 관리자 우회가 필요하다. 훈련은 CI가 통과한 뒤라 우회 없이 머지된다
BYPASS=(--admin)
if [[ -n "${CI_GATE_DRILL:-}" && "$state" == "pass" ]]; then
  state="unavailable"; reason="훈련 (CI_GATE_DRILL) — CI는 통과했다"
  BYPASS=()
fi

case "$state" in
  pass)
    gh pr merge "$PR" "${MERGE_ARGS[@]}"
    ;;
  fail)
    echo "CI 검사가 실패했다. 머지하지 않는다: $reason"
    exit 1
    ;;
  unavailable)
    echo "CI를 쓸 수 없다 ($reason). PR이 머지된 모습을 로컬에서 검증한다"
    git -C "$ROOT" fetch --quiet origin "$BASE" "$HEAD_SHA"
    # CI의 pull_request 실행처럼 「base에 머지한 결과」를 검사한다. head만 보면
    # base에 들어온 다른 변경과의 충돌을 놓친다
    MERGE_TREE="$(mktemp -d)"
    git -C "$ROOT" worktree add --detach --quiet "$MERGE_TREE" "origin/$BASE"
    if ! git -C "$MERGE_TREE" -c user.name=merge-gate -c user.email=merge-gate@localhost \
        merge --no-ff --quiet -m "merge-gate 검증" "$HEAD_SHA"; then
      git -C "$ROOT" worktree remove --force "$MERGE_TREE"
      echo "base에 머지하면 충돌한다. 머지하지 않는다"
      exit 1
    fi
    MERGED_SHA="$(git -C "$MERGE_TREE" rev-parse HEAD)"
    git -C "$ROOT" worktree remove --force "$MERGE_TREE"

    OUT="$(mktemp)"
    if bash "$ROOT/scripts/verify-local.sh" "$MERGED_SHA" | tee "$OUT"; then
      {
        echo "### 로컬 검증으로 머지 (ADR-0029)"
        echo
        echo "CI를 쓸 수 없었다: $reason"
        echo
        echo "PR head \`${HEAD_SHA:0:7}\` 를 \`$BASE\` 에 머지한 결과를 ci.yml 과 같은 명령으로 검증했다 (빈 DB, CI=true)."
        echo
        echo '```'
        sed -n '/^로컬 검증/,$p' "$OUT"
        echo '```'
      } | gh pr comment "$PR" --body-file -
      rm -f "$OUT"
      # 규칙 집합이 CI 검사(verify)를 요구하므로 그냥 머지하면 막힌다. 관리자 우회로 머지한다 —
      # 우회는 규칙 집합에 「관리자, PR로만」 우회 권한이 있어야 된다 (ADR-0029 §규칙 집합)
      if ! gh pr merge "$PR" "${MERGE_ARGS[@]}" "${BYPASS[@]}"; then
        echo "머지가 막혔다. 규칙 집합(def protect)에 관리자 우회 권한이 없다."
        echo "로컬 검증은 통과했고 PR에 기록했다. 사람이 우회 권한을 더하거나 CI가 돌아온 뒤 다시 부른다."
        exit 1
      fi
    else
      rm -f "$OUT"
      echo "로컬 검증이 실패했다. 머지하지 않는다"
      exit 1
    fi
    ;;
esac
