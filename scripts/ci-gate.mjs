#!/usr/bin/env node
/**
 * 이 커밋의 CI를 믿을 수 있는가 — ADR-0029.
 *
 *   node scripts/ci-gate.mjs <sha>     → {"state":"pass|fail|pending|unavailable","reason":"..."}
 *
 * 네 가지를 가른다.
 * - pass: CI가 돌았고 통과했다
 * - fail: CI가 돌았고 **검사 단계에서** 깨졌다. 머지하지 않는다
 * - pending: 아직 도는 중이다. 기다린다
 * - unavailable: CI가 **돌지 못했다** — 사용량·결제 잠금, 작업이 시작되지 않음,
 *   대기열에서 오래 멈춤, Actions가 꺼져 실행이 아예 없음. 코드 탓이 아니므로
 *   로컬 검증(scripts/verify-local.sh)으로 대신한다
 *
 * fail과 unavailable을 섞으면 안 된다. 깨진 코드를 「CI가 안 돌았다」로 읽고
 * 로컬로 돌려 통과시키는 일이 생긴다 — 로컬은 같은 명령이지만 환경이 다르다.
 * 그래서 **단계가 하나라도 실제로 실행돼 실패했으면 fail이다.**
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** GitHub이 작업을 시작하지 않을 때 남기는 말. 결제·사용량·잠금 */
const NOT_STARTED =
  /not started because|spending limit|billing|account is locked|payments have failed|exceeded.*minutes|minutes.*exceeded/i;

/** 실행이 이만큼 대기열에만 있으면 돌 수 없다고 본다 */
export const QUEUE_LIMIT_MIN = 30;
/** push 뒤 이만큼 지나도 실행이 하나도 없으면 Actions가 꺼진 것이다 */
export const NO_RUN_LIMIT_MIN = 10;

/**
 * @param {{
 *   runs: { status: string, conclusion: string | null, createdAt: string,
 *           jobs?: { conclusion: string | null, steps: { conclusion: string | null, name: string }[],
 *                    annotations?: string[] }[] }[],
 *   pushedAt: string,
 *   now: string,
 * }} input
 */
export function classify({ runs, pushedAt, now }) {
  const minutes = (from) => (Date.parse(now) - Date.parse(from)) / 60_000;

  if (runs.length === 0) {
    return minutes(pushedAt) >= NO_RUN_LIMIT_MIN
      ? { state: 'unavailable', reason: `push 뒤 ${NO_RUN_LIMIT_MIN}분 동안 CI 실행이 없다 (Actions 꺼짐?)` }
      : { state: 'pending', reason: 'CI 실행을 기다리는 중' };
  }

  // 같은 커밋에 실행이 여럿이면(push + pull_request) 하나라도 통과하면 된다.
  // 다만 하나라도 **실제로 깨졌으면** 통과보다 앞선다 — 같은 코드다
  if (runs.some((r) => r.conclusion === 'failure' && ranAndFailed(r))) {
    const r = runs.find((x) => x.conclusion === 'failure' && ranAndFailed(x));
    const step = r.jobs?.flatMap((j) => j.steps).find((s) => s.conclusion === 'failure');
    return { state: 'fail', reason: `검사 실패${step ? `: ${step.name}` : ''}` };
  }
  // ★ 도는 것이 하나라도 있으면 기다린다 — 통과한 것이 있어도. push·PR 실행이 둘인데
  // 하나만 끝난 채 머지하면 규칙 집합(required_status_checks)이 막는다 (PR #141, T-25)
  const active = runs.filter((r) => r.status !== 'completed');
  if (active.length > 0) {
    const stuck = active.every((r) => r.status === 'queued' && minutes(r.createdAt) >= QUEUE_LIMIT_MIN);
    if (!stuck) return { state: 'pending', reason: 'CI가 도는 중' };
    // 멈춘 것만 남았는데 다른 실행이 통과했으면 그 통과로 충분하다 — 같은 코드다
    if (!runs.some((r) => r.conclusion === 'success')) {
      return { state: 'unavailable', reason: `대기열에서 ${QUEUE_LIMIT_MIN}분 넘게 시작하지 못했다` };
    }
  }
  if (runs.some((r) => r.conclusion === 'success')) return { state: 'pass', reason: 'CI 통과' };

  const notes = runs.flatMap((r) => r.jobs ?? []).flatMap((j) => j.annotations ?? []);
  const billing = notes.find((n) => NOT_STARTED.test(n));
  if (billing) return { state: 'unavailable', reason: `CI가 시작되지 않았다: ${billing.slice(0, 160)}` };
  if (runs.some((r) => r.conclusion === 'startup_failure')) {
    return { state: 'unavailable', reason: 'CI가 시작 단계에서 실패했다 (startup_failure)' };
  }
  // 실패했지만 단계가 하나도 돌지 않았다 — 러너를 받지 못한 것이다
  if (runs.every((r) => r.conclusion === 'failure' && !ranAndFailed(r))) {
    return { state: 'unavailable', reason: '작업이 단계를 하나도 실행하지 못하고 끝났다' };
  }
  // 취소만 남았다 — 다시 돌려야 한다. 우리가 고르지 않는다
  return { state: 'fail', reason: `CI 결과를 판단할 수 없다 (${runs.map((r) => r.conclusion).join(', ')})` };
}

/** 실패한 실행에서 검사 단계가 하나라도 실제로 돌아 실패했는가 */
function ranAndFailed(run) {
  return (run.jobs ?? []).some((j) => j.steps.some((s) => s.conclusion === 'failure'));
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** gh로 이 커밋의 CI 실행·작업·주석을 모은다 */
function collect(sha) {
  // 레포 주소를 코드에 박지 않는다 (ADR-0019) — 지금 체크아웃의 레포를 쓴다
  const repo = JSON.parse(gh(['repo', 'view', '--json', 'nameWithOwner'])).nameWithOwner;
  const list = JSON.parse(
    gh(['run', 'list', '--commit', sha, '--workflow', 'CI', '--json', 'databaseId,status,conclusion,createdAt', '--limit', '20']),
  );
  const runs = list.map((r) => {
    if (r.status !== 'completed' || r.conclusion === 'success') return r;
    const { jobs } = JSON.parse(gh(['run', 'view', String(r.databaseId), '--json', 'jobs']));
    return {
      ...r,
      jobs: jobs.map((j) => {
        let annotations = [];
        try {
          annotations = JSON.parse(gh(['api', `repos/${repo}/check-runs/${j.databaseId}/annotations`])).map(
            (a) => a.message,
          );
        } catch {
          // 주석을 못 읽어도 단계 기록으로 판단한다
        }
        return { conclusion: j.conclusion, steps: j.steps ?? [], annotations };
      }),
    };
  });
  const pushedAt = gh(['api', `repos/${repo}/commits/${sha}`, '--jq', '.commit.committer.date']).trim();
  return { runs, pushedAt, now: new Date().toISOString() };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sha = process.argv[2];
  if (!sha) {
    console.error('사용: node scripts/ci-gate.mjs <sha>');
    process.exit(2);
  }
  try {
    process.stdout.write(JSON.stringify(classify(collect(sha))) + '\n');
  } catch (e) {
    // gh가 API에 닿지 못했다. CI 판단을 못 하므로 unavailable이 아니라 멈춘다 —
    // GitHub이 안 되면 머지도 안 된다
    console.error(`CI 상태를 읽지 못했다: ${e.message}`);
    process.exit(3);
  }
}
