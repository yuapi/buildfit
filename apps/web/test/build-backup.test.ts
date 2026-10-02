/**
 * 저장 견적 백업 파일 — §8A.3.
 *
 * 지키는 것 셋:
 * 1. 내보낸 파일을 그대로 다시 읽으면 같은 목록이다 (왕복)
 * 2. 형식이 틀린 파일은 **아무것도 바꾸지 않는다**
 * 3. 가져오기가 **이 브라우저의 견적을 밀어내지 않는다**
 */

import { describe, expect, it } from 'vitest';
import {
  BACKUP_APP,
  BACKUP_KIND,
  MAX_BACKUP_BYTES,
  backupFileName,
  describeImport,
  describeProblem,
  exportBuilds,
  mergeBuilds,
  parseBackup,
} from '../src/lib/build-backup';
import { encodeBuildCode } from '../src/lib/build-code';
import { LIMITS, type SavedBuild } from '../src/lib/storage';

const uuid = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const code = (n: number) => encodeBuildCode({ cpu: uuid(n) });
const build = (n: number, savedAt: string, label = `견적 ${n}`): SavedBuild => ({
  v: 1,
  code: code(n),
  label,
  savedAt,
});
const NOW = new Date(2026, 9, 2, 8, 30);

describe('내보내기·읽기 왕복', () => {
  it('내보낸 파일을 다시 읽으면 같은 목록이다', () => {
    const list = [build(1, '2026-10-01T00:00:00.000Z'), build(2, '2026-09-30T00:00:00.000Z', '게임용')];
    const parsed = parseBackup(exportBuilds(list, NOW));
    expect(parsed).toEqual({ ok: true, builds: list, unreadable: 0 });
  });

  it('파일에는 무엇인지 알 수 있는 표지가 붙는다', () => {
    const o = JSON.parse(exportBuilds([], NOW));
    expect(o.app).toBe(BACKUP_APP);
    expect(o.kind).toBe(BACKUP_KIND);
    expect(o.v).toBe(1);
    expect(o.exportedAt).toBe(NOW.toISOString());
    expect(o.builds).toEqual([]);
  });

  it('파일 이름은 사용자 시계의 날짜다', () => {
    expect(backupFileName(NOW)).toBe('buildfit-견적-2026-10-02.json');
  });
});

describe('읽기 — 항목', () => {
  it('★ 코드가 안 읽히는 항목은 버리고 센다 — 죽은 링크를 목록에 넣지 않는다', () => {
    const text = JSON.stringify({
      app: BACKUP_APP,
      kind: BACKUP_KIND,
      v: 1,
      builds: [build(1, '2026-10-01T00:00:00.000Z'), { v: 1, code: '!!깨진코드', label: 'x' }, 42, null],
    });
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.builds.map((b) => b.code)).toEqual([code(1)]);
    expect(parsed.unreadable).toBe(3);
  });

  it('버전이 더 높은 파일도 읽는다 — 형식은 add-only다', () => {
    const text = JSON.stringify({
      app: BACKUP_APP,
      kind: BACKUP_KIND,
      v: 7,
      future: { x: 1 },
      builds: [{ ...build(1, '2026-10-01T00:00:00.000Z'), v: 9, extra: true }],
    });
    const parsed = parseBackup(text);
    expect(parsed.ok && parsed.builds[0]?.code).toBe(code(1));
  });
});

describe('★ 읽기 — 형식이 틀리면 아무것도 돌려주지 않는다', () => {
  it.each([
    ['JSON이 아니다', 'hello', 'not-json'],
    ['다른 앱의 파일', JSON.stringify({ app: 'other', kind: BACKUP_KIND, builds: [] }), 'not-backup'],
    ['다른 종류', JSON.stringify({ app: BACKUP_APP, kind: 'prefs', builds: [] }), 'not-backup'],
    ['배열 자체', JSON.stringify([]), 'not-backup'],
    ['목록이 없다', JSON.stringify({ app: BACKUP_APP, kind: BACKUP_KIND }), 'no-list'],
    ['너무 크다', ' '.repeat(MAX_BACKUP_BYTES + 1), 'too-large'],
  ] as const)('%s → %s', (_name, text, problem) => {
    expect(parseBackup(text)).toEqual({ ok: false, problem });
  });

  it('안내는 저장 목록이 그대로라고 말한다', () => {
    expect(describeProblem('not-json')).toContain('저장 목록은 그대로입니다');
  });
});

describe('합치기', () => {
  const old = '2026-01-01T00:00:00.000Z';
  const mid = '2026-05-01T00:00:00.000Z';
  const late = '2026-09-01T00:00:00.000Z';

  it('새 견적을 더하고 저장 시각 최신순으로 둔다', () => {
    const r = mergeBuilds([build(1, mid)], [build(2, late), build(3, old)], LIMITS.builds);
    expect(r.builds.map((b) => b.code)).toEqual([code(2), code(1), code(3)]);
    expect(r).toMatchObject({ added: 2, duplicate: 0, overLimit: 0 });
  });

  it('★ 같은 코드는 지금 것을 둔다 — 이름을 덮지 않는다', () => {
    const r = mergeBuilds([build(1, mid, '내가 고친 이름')], [build(1, late, '옛 이름')], LIMITS.builds);
    expect(r.builds).toEqual([build(1, mid, '내가 고친 이름')]);
    expect(r).toMatchObject({ added: 0, duplicate: 1 });
  });

  it('파일 안에서 겹친 것도 한 번만 넣는다', () => {
    const r = mergeBuilds([], [build(1, late), build(1, mid)], LIMITS.builds);
    expect(r.builds).toHaveLength(1);
    expect(r).toMatchObject({ added: 1, duplicate: 1 });
  });

  it('★ 상한에 걸려도 지금 견적은 하나도 빠지지 않는다 — 파일 쪽이 더 최신이어도', () => {
    const current = Array.from({ length: 19 }, (_, i) => build(100 + i, mid));
    // 파일 쪽에 지금 것보다 **최신인 것이 자리보다 많다.** 전체를 최신순으로 잘랐다면
    // 지금 견적 하나가 밀려난다
    const newest = '2026-09-30T00:00:00.000Z';
    const r = mergeBuilds(current, [build(1, old), build(2, late), build(3, newest)], 20);
    expect(r.builds).toHaveLength(20);
    for (const b of current) expect(r.builds.map((x) => x.code)).toContain(b.code);
    // 남은 한 자리는 파일의 가장 최신 것
    expect(r.builds.map((x) => x.code)).toContain(code(3));
    expect(r).toMatchObject({ added: 1, duplicate: 0, overLimit: 2 });
  });

  it('지금 목록이 이미 가득이면 하나도 넣지 않고 그 수를 센다', () => {
    const current = Array.from({ length: 20 }, (_, i) => build(100 + i, mid));
    const r = mergeBuilds(current, [build(1, late)], 20);
    expect(r.builds).toEqual(current);
    expect(r).toMatchObject({ added: 0, overLimit: 1 });
  });
});

describe('결과 안내', () => {
  it('넣은 것과 건너뛴 이유를 함께 말한다', () => {
    expect(describeImport({ added: 3, duplicate: 1, overLimit: 2 }, 1, 20)).toBe(
      '3개를 더했습니다. 건너뜀: 이미 있음 1개 · 읽을 수 없음 1개 · 저장 상한(20개) 초과 2개',
    );
  });

  it('건너뛴 것이 없으면 그것만', () => {
    expect(describeImport({ added: 2, duplicate: 0, overLimit: 0 }, 0, 20)).toBe('2개를 더했습니다.');
  });

  it('하나도 못 넣었으면 그렇다고 말한다', () => {
    expect(describeImport({ added: 0, duplicate: 4, overLimit: 0 }, 0, 20)).toBe(
      '더한 견적이 없습니다. 건너뜀: 이미 있음 4개',
    );
  });
});
