/**
 * 결측 현황 집계.
 *
 * 어드민의 첫 화면이자 공개 「검사 규칙」 페이지의 근거다. 숫자가 틀리면
 * "무엇을 채워야 효과가 큰가"라는 판단이 틀린다.
 *
 * DB가 필요하다. `DATABASE_URL`이 없으면 건너뛴다 — CI에는 항상 있다.
 */

import { SPEC_REQUIREMENTS } from '@buildfit/compat';
import { createDb } from '@buildfit/db';
import { fieldGapSummary } from '@buildfit/db/queries';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createScratchDb, type Scratch } from './helpers/scratch-db';

const describeIfDb = process.env['DATABASE_URL'] ? describe : describe.skip;

if (process.env['CI'] === 'true' && !process.env['DATABASE_URL']) {
  throw new Error('CI인데 DATABASE_URL이 없다. 결측 집계 검증이 조용히 빠진다.');
}

describeIfDb('결측 현황 집계', () => {
  let scratch: Scratch;
  let db: ReturnType<typeof createDb>['db'];
  let close: () => Promise<void>;

  beforeAll(async () => {
    scratch = await createScratchDb();
    const made = createDb(scratch.url, { max: 2 });
    db = made.db;
    close = () => made.client.end();

    // CPU 3건: 소켓 있는 것 2, 없는 것 1.
    await db.execute(sql`
      insert into parts (id, slug, category, model_name) values
        ('a1111111-1111-4111-8111-111111111111', 'g-cpu1', 'CPU', 'CPU 하나'),
        ('a2222222-2222-4222-8222-222222222222', 'g-cpu2', 'CPU', 'CPU 둘'),
        ('a3333333-3333-4333-8333-333333333333', 'g-cpu3', 'CPU', 'CPU 셋')
    `);
    await db.execute(sql`
      insert into part_specs (part_id, key, value) values
        ('a1111111-1111-4111-8111-111111111111', 'socket', '"AM5"'::jsonb),
        -- 값이 JSON 널이어도 **행은 있다.** 집계는 행 유무로 센다 —
        -- 결측 판정은 규칙 엔진이 따로 한다 (ADR-0009).
        ('a2222222-2222-4222-8222-222222222222', 'socket', 'null'::jsonb)
    `);
  }, 60_000);

  afterAll(async () => {
    await close?.();
    await scratch?.drop();
  });

  const find = async (category: string, specKey: string) =>
    (await fieldGapSummary(db)).find((g) => g.category === category && g.specKey === specKey);

  it('★ 행이 있으면 채운 것으로 센다', async () => {
    // 값이 널이어도 행은 있다. 전과 같은 기준이다.
    const g = await find('CPU', 'socket');
    expect(g?.totalParts).toBe(3);
    expect(g?.missingParts).toBe(1);
    expect(g?.missingPct).toBe(33.3);
  });

  it('★ 부품이 없는 카테고리는 표에 넣지 않는다', async () => {
    // 0을 100% 결측으로 내면 "케이스가 전부 비었다"는 거짓말이 된다.
    const rows = await fieldGapSummary(db);
    expect(rows.every((r) => r.category === 'CPU')).toBe(true);
  });

  it('이 필드가 막는 규칙을 함께 준다', async () => {
    const g = await find('CPU', 'socket');
    // CPU 소켓은 규칙 1과 12를 막는다.
    expect(g?.blocksRules).toContain(1);
  });

  it('보조 필드는 세지 않는다 — 없어도 판정이 막히지 않는다', async () => {
    const optional = SPEC_REQUIREMENTS.filter((r) => r.optional === true);
    const rows = await fieldGapSummary(db);
    for (const o of optional) {
      expect(
        rows.some((r) => r.category === o.category && r.specKey === o.specKey),
        `${o.category}.${o.specKey}`,
      ).toBe(false);
    }
  });

  it('결측이 많은 순이다 — 채웠을 때 효과가 큰 것부터', async () => {
    const rows = await fieldGapSummary(db);
    const counts = rows.map((r) => r.missingParts);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it('빈 DB에서도 던지지 않는다', async () => {
    await db.execute(sql`delete from parts`);
    expect(await fieldGapSummary(db)).toEqual([]);
  });
});
