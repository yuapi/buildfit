/**
 * CI를 쓸 수 없을 때의 머지 경로 — ADR-0029.
 *
 * 두 가지를 지킨다.
 * 1. 「CI가 깨졌다」와 「CI가 돌지 못했다」를 섞지 않는다. 섞으면 깨진 코드가
 *    로컬 검증으로 머지된다
 * 2. 로컬 검증이 ci.yml과 **같은 명령**을 돈다. 두 벌이 되면 한쪽만 고친다
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

type Step = { name: string; conclusion: string | null };
type Run = {
  status: string;
  conclusion: string | null;
  createdAt: string;
  jobs?: { conclusion: string | null; steps: Step[]; annotations?: string[] }[];
};
type Verdict = { state: 'pass' | 'fail' | 'pending' | 'unavailable'; reason: string };

// 경로를 변수로 두어 tsc가 .mjs의 타입을 찾지 않게 한다
const modPath = join(ROOT, 'scripts/ci-gate.mjs');
const { classify } = (await import(modPath)) as {
  classify: (i: { runs: Run[]; pushedAt: string; now: string }) => Verdict;
};

const T0 = '2026-10-21T00:00:00Z';
const at = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString();
const ran = (fail?: string): Step[] => [
  { name: 'Set up job', conclusion: 'success' },
  { name: '테스트', conclusion: fail === '테스트' ? 'failure' : 'success' },
];

describe('CI 상태 가르기', () => {
  it('통과', () => {
    expect(classify({ runs: [{ status: 'completed', conclusion: 'success', createdAt: T0 }], pushedAt: T0, now: at(5) }).state).toBe('pass');
  });

  it('★ 검사 단계가 실제로 돌아 실패했으면 fail — 로컬로 우회하지 않는다', () => {
    const v = classify({
      runs: [{ status: 'completed', conclusion: 'failure', createdAt: T0, jobs: [{ conclusion: 'failure', steps: ran('테스트') }] }],
      pushedAt: T0,
      now: at(5),
    });
    expect(v.state).toBe('fail');
    expect(v.reason).toContain('테스트');
  });

  it('★ 같은 커밋의 다른 실행이 통과했어도 실제 실패가 있으면 fail', () => {
    const v = classify({
      runs: [
        { status: 'completed', conclusion: 'success', createdAt: T0 },
        { status: 'completed', conclusion: 'failure', createdAt: T0, jobs: [{ conclusion: 'failure', steps: ran('테스트') }] },
      ],
      pushedAt: T0,
      now: at(5),
    });
    expect(v.state).toBe('fail');
  });

  it('★ 사용량·결제 때문에 작업이 시작되지 않았으면 unavailable', () => {
    const v = classify({
      runs: [
        {
          status: 'completed',
          conclusion: 'failure',
          createdAt: T0,
          jobs: [
            {
              conclusion: 'failure',
              steps: [],
              annotations: [
                'The job was not started because recent account payments have failed or your spending limit needs to be increased.',
              ],
            },
          ],
        },
      ],
      pushedAt: T0,
      now: at(2),
    });
    expect(v.state).toBe('unavailable');
  });

  it('계정 잠금도 unavailable', () => {
    const v = classify({
      runs: [{ status: 'completed', conclusion: 'failure', createdAt: T0, jobs: [{ conclusion: 'failure', steps: [], annotations: ['The job was not started because your account is locked due to a billing issue.'] }] }],
      pushedAt: T0,
      now: at(2),
    });
    expect(v.state).toBe('unavailable');
  });

  it('단계를 하나도 돌지 못하고 끝났으면 unavailable (주석을 못 읽어도)', () => {
    const v = classify({
      runs: [{ status: 'completed', conclusion: 'failure', createdAt: T0, jobs: [{ conclusion: 'failure', steps: [] }] }],
      pushedAt: T0,
      now: at(2),
    });
    expect(v.state).toBe('unavailable');
  });

  it('startup_failure는 unavailable', () => {
    expect(classify({ runs: [{ status: 'completed', conclusion: 'startup_failure', createdAt: T0 }], pushedAt: T0, now: at(2) }).state).toBe('unavailable');
  });

  it('★ 실행 둘 중 하나만 통과하고 하나가 도는 중이면 pending — 규칙 집합이 머지를 막는다 (T-25)', () => {
    const v = classify({
      runs: [
        { status: 'completed', conclusion: 'success', createdAt: T0 },
        { status: 'in_progress', conclusion: null, createdAt: T0 },
      ],
      pushedAt: T0,
      now: at(3),
    });
    expect(v.state).toBe('pending');
  });

  it('하나는 통과하고 하나는 대기열에 오래 멈췄으면 통과로 본다', () => {
    const v = classify({
      runs: [
        { status: 'completed', conclusion: 'success', createdAt: T0 },
        { status: 'queued', conclusion: null, createdAt: T0 },
      ],
      pushedAt: T0,
      now: at(40),
    });
    expect(v.state).toBe('pass');
  });

  it('대기열에서 잠깐이면 pending, 오래 멈추면 unavailable', () => {
    const run = { status: 'queued', conclusion: null, createdAt: T0 };
    expect(classify({ runs: [run], pushedAt: T0, now: at(5) }).state).toBe('pending');
    expect(classify({ runs: [run], pushedAt: T0, now: at(31) }).state).toBe('unavailable');
  });

  it('도는 중이면 오래 걸려도 pending — 대기열만 멈춤으로 본다', () => {
    expect(classify({ runs: [{ status: 'in_progress', conclusion: null, createdAt: T0 }], pushedAt: T0, now: at(60) }).state).toBe('pending');
  });

  it('실행이 아예 없으면 잠시 기다리다가 unavailable (Actions 꺼짐)', () => {
    expect(classify({ runs: [], pushedAt: T0, now: at(3) }).state).toBe('pending');
    expect(classify({ runs: [], pushedAt: T0, now: at(11) }).state).toBe('unavailable');
  });

  it('취소만 남았으면 판단하지 않는다 — fail로 멈춘다', () => {
    expect(classify({ runs: [{ status: 'completed', conclusion: 'cancelled', createdAt: T0, jobs: [] }], pushedAt: T0, now: at(5) }).state).toBe('fail');
  });
});

describe('로컬 검증 = CI의 명령', () => {
  const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
  const fromCi = [...ci.matchAll(/^\s*(?:- )?run:\s*(.+)$/gm)].map((m) => m[1]!.trim());

  it('ci.yml에서 명령을 찾았다', () => {
    expect(fromCi).toContain('npm test');
    expect(fromCi).toContain('npm run build');
    expect(fromCi.length).toBeGreaterThanOrEqual(6);
  });

  it('★ verify-local.sh가 ci.yml의 명령을 같은 순서로 돈다', () => {
    const r = spawnSync('bash', [join(ROOT, 'scripts/verify-local.sh'), '--print-steps'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout.trim().split('\n').map((s) => s.trim())).toEqual(fromCi);
  });

  it.each(['verify-local.sh', 'merge-gate.sh'])('%s 가 bash 문법 검사를 통과한다', (f) => {
    const r = spawnSync('bash', ['-n', join(ROOT, 'scripts', f)], { encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('★ 관리자 우회(--admin)는 쓸 수 없음 경로에서만, 훈련에서는 쓰지 않는다', () => {
    const sh = readFileSync(join(ROOT, 'scripts/merge-gate.sh'), 'utf8');
    const passBranch = sh.slice(sh.indexOf('  pass)'), sh.indexOf('  fail)'));
    expect(passBranch).not.toContain('--admin');
    expect(passBranch).not.toContain('BYPASS');
    expect(sh).toMatch(/CI_GATE_DRILL[\s\S]*BYPASS=\(\)/);
  });

  it('★ 로컬 검증이 운영 DB 포트(5432)를 고르지 않는다', () => {
    const sh = readFileSync(join(ROOT, 'scripts/verify-local.sh'), 'utf8');
    const range = /seq (\d+) (\d+)/.exec(sh);
    expect(range).not.toBeNull();
    expect(Number(range![1])).toBeGreaterThan(5432);
  });
});
