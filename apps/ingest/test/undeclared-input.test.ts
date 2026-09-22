/**
 * 규칙이 **선언되지 않은 입력을 읽고 있지 않은지** 본다 — 이슈 #15.
 *
 * `/rules`는 "각 검사가 쓰는 데이터가 얼마나 비어 있는지"를 공개한다. 그 표는
 * `SPEC_REQUIREMENTS`로 만든다. 규칙이 선언에 없는 값을 읽으면 **표가 결측을
 * 축소해서 보여준다** — 실제로 규칙 12가 그랬다. 화면은 0.7%라고 적는데 판정
 * 불가는 85.7%였다. 출시 연도가 선언에 없었다.
 *
 * 그 어긋남을 수치로 잡는다.
 *
 * - 규칙 하나의 **결측 때문인** 판정 불가율은, 그 규칙이 선언한 필드들의 결측률
 *   **합을 넘을 수 없다** (합집합 상한)
 * - 넘으면 선언에 없는 입력이 판정을 막고 있다는 뜻이다
 *
 * `inconsistent`·`out-of-range`는 세지 않는다. 그것은 값이 **있는데** 이상한
 * 경우라 결측률과 무관하다 (규칙 17·18이 그렇다).
 *
 * 실제 카탈로그가 필요하다 — 픽스처로는 이 어긋남이 드러나지 않는다.
 * `DATABASE_URL`이 없으면 건너뛴다.
 */

import { SPEC_REQUIREMENTS, evaluate } from '@buildfit/compat';
import { createDb, parts } from '@buildfit/db';
import { loadBuild } from '@buildfit/db/build';
import { fieldGapSummary } from '@buildfit/db/queries';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const describeIfDb = process.env['DATABASE_URL'] ? describe : describe.skip;

if (process.env['CI'] === 'true' && !process.env['DATABASE_URL']) {
  throw new Error('CI인데 DATABASE_URL이 없다. 선언 누락 검증이 조용히 빠진다.');
}

/** 표본 수. 크게 잡을수록 안정적이지만 CI 시간이 든다 */
const BUILDS = 120;
/** 표본 오차 여유. 합집합 상한은 진짜 상한이라 넘는 것 자체가 신호다 */
const SLACK_PCT = 8;

const CATEGORIES = [
  'CPU',
  'Motherboard',
  'RAM',
  'GPU',
  'PCCase',
  'PSU',
  'CPUCooler',
  'Storage',
] as const;

describeIfDb('규칙이 선언되지 않은 입력을 읽지 않는다 (이슈 #15)', () => {
  let db: ReturnType<typeof createDb>['db'];
  let close: () => Promise<void>;
  /** ruleId → 결측 때문인 판정 불가 비율(%) */
  const missingUnknownPct = new Map<number, number>();
  /** ruleId → 선언한 필드 결측률의 합(%) */
  const declaredSumPct = new Map<number, number>();

  beforeAll(async () => {
    const made = createDb(process.env['DATABASE_URL']!, { max: 4 });
    db = made.db;
    close = () => made.client.end();

    const pools = new Map<string, string[]>();
    for (const category of CATEGORIES) {
      const rows = await db
        .select({ id: parts.id })
        .from(parts)
        .where(and(eq(parts.category, category), sql`${parts.duplicateOf} is null`))
        // 되풀이해도 같은 표본이 나와야 수치를 비교할 수 있다
        .orderBy(sql`md5(${parts.id}::text)`)
        .limit(BUILDS);
      pools.set(category, rows.map((r) => r.id));
    }

    const seen = new Map<number, { total: number; missing: number }>();
    for (let i = 0; i < BUILDS; i += 1) {
      const pick = (c: string): string | undefined => pools.get(c)?.[i];
      const build = await loadBuild(db, {
        cpu: pick('CPU'),
        motherboard: pick('Motherboard'),
        ram: [pick('RAM')].filter((v): v is string => !!v),
        gpu: pick('GPU'),
        pcCase: pick('PCCase'),
        psu: pick('PSU'),
        cooler: pick('CPUCooler'),
        storage: [pick('Storage')].filter((v): v is string => !!v),
      });
      for (const r of evaluate(build).results) {
        const acc = seen.get(r.ruleId) ?? { total: 0, missing: 0 };
        acc.total += 1;
        if (r.verdict === 'unknown' && r.reason?.kind === 'missing') acc.missing += 1;
        seen.set(r.ruleId, acc);
      }
    }
    for (const [id, a] of seen) missingUnknownPct.set(id, (100 * a.missing) / a.total);

    const gaps = await fieldGapSummary(db);
    for (const req of SPEC_REQUIREMENTS) {
      if (req.optional === true) continue;
      const g = gaps.find((x) => x.category === req.category && x.specKey === req.specKey);
      if (!g) continue;
      declaredSumPct.set(req.ruleId, (declaredSumPct.get(req.ruleId) ?? 0) + g.missingPct);
    }
  }, 180_000);

  afterAll(async () => {
    await close();
  });

  it('표본이 실제로 돌았다', () => {
    expect(missingUnknownPct.size, '규칙이 하나도 돌지 않았다').toBeGreaterThanOrEqual(10);
    // 스토리지를 담지 않으면 규칙 17~19가 빠진다. 그 구멍이 다시 생기지 않게 못 박는다
    for (const id of [17, 18, 19]) {
      expect(missingUnknownPct.has(id), `규칙 ${id}이 표본에서 돌지 않았다`).toBe(true);
    }
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 15, 16, 17, 18, 19])(
    '규칙 %d의 결측 판정 불가율이 선언한 필드로 설명된다',
    (ruleId) => {
      const actual = missingUnknownPct.get(ruleId);
      if (actual === undefined) return;
      const bound = (declaredSumPct.get(ruleId) ?? 0) + SLACK_PCT;
      expect(
        actual,
        `규칙 ${ruleId}: 결측 판정 불가 ${actual.toFixed(1)}%인데 선언한 필드의 결측 합은 ` +
          `${(declaredSumPct.get(ruleId) ?? 0).toFixed(1)}%다. ` +
          `선언에 없는 입력이 판정을 막고 있을 수 있다 — SPEC_REQUIREMENTS를 본다.`,
      ).toBeLessThanOrEqual(bound);
    },
  );
});
