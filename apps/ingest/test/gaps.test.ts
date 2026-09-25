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
import {
  fieldGapSummary,
  gapCounts,
  partWithSpecs,
  partsMissingField,
  saveSpec,
} from '@buildfit/db/queries';
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
    // CPU 소켓은 규칙 1과 20을 막는다.
    expect(g?.blocksRules).toContain(1);
  });

  it('★ (카테고리, 키) 하나에 한 줄이다 — 두 규칙이 같은 필드를 써도 (이슈 #58)', async () => {
    const all = await fieldGapSummary(db);
    const ids = all.map((g) => `${g.category}.${g.specKey}`);
    expect(ids.length).toBe(new Set(ids).size);
    // CPU 소켓은 규칙 1과 20이 각각 선언한다. 한 줄에 두 규칙이 다 적힌다
    const socket = all.filter((g) => g.category === 'CPU' && g.specKey === 'socket');
    expect(socket).toHaveLength(1);
    expect(socket[0]!.blocksRules).toEqual(expect.arrayContaining([1, 20]));
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

  it('★ 출처를 열 수 있는 것을 먼저 준다 (이슈 #3)', async () => {
    // CPU 셋 중 소켓이 빈 것은 '하나'뿐이라 목록이 짧다. 둘 더 심는다.
    await db.execute(sql`
      insert into parts (id, slug, category, model_name, release_year, manufacturer_url) values
        ('b1111111-1111-4111-8111-111111111111', 'g-nosrc-new', 'CPU', '주소 없는 최신',  2026, null),
        ('b2222222-2222-4222-8222-222222222222', 'g-src-old',   'CPU', '주소 있는 구형',  2010, 'https://example.com/a')
    `);
    try {
      const rows = await partsMissingField(db, 'CPU', 'socket');
      // 출시연도가 더 최신인데도 주소 있는 쪽이 먼저다 — 출처 찾기가 가장 비싸다
      expect(rows[0]?.modelName).toBe('주소 있는 구형');
      expect(rows.map((r) => r.modelName)).toContain('주소 없는 최신');

      const counts = await gapCounts(db, 'CPU', 'socket');
      expect(counts.missing).toBe(rows.length);
      expect(counts.withSource).toBe(1);
    } finally {
      await db.execute(sql`delete from parts where slug in ('g-nosrc-new', 'g-src-old')`);
    }
  });

  it('집계와 목록이 같은 것을 센다 — 조건이 두 벌이면 "0건"인데 줄이 남는다', async () => {
    const counts = await gapCounts(db, 'CPU', 'socket');
    const rows = await partsMissingField(db, 'CPU', 'socket', { limit: 1000 });
    expect(counts.missing).toBe(rows.length);
  });

  // --- parts 컬럼에 있는 입력 (이슈 #15) ---------------------------------

  it('★ 출시 연도 결측을 part_specs가 아니라 컬럼으로 센다', async () => {
    // CPU 셋 중 둘에만 연도를 넣는다. part_specs에는 아무 행도 없다.
    await db.execute(sql`
      update parts set release_year = 2024
      where slug in ('g-cpu1', 'g-cpu2')`);
    const g = (await fieldGapSummary(db)).find(
      (r) => r.category === 'CPU' && r.specKey === 'release_year',
    );
    expect(g, '출시 연도가 결측 집계에 없다 — /rules가 규칙 12의 병목을 숨긴다').toBeDefined();
    expect(g?.totalParts).toBe(3);
    expect(g?.missingParts).toBe(1);
    expect(g?.blocksRules).toContain(12);
  });

  it('빈 필드 목록과 건수도 컬럼으로 센다', async () => {
    const rows = await partsMissingField(db, 'CPU', 'release_year');
    expect(rows.map((r) => r.slug)).toEqual(['g-cpu3']);
    expect(await gapCounts(db, 'CPU', 'release_year')).toEqual({ missing: 1, withSource: 0 });
  });

  it('★ 저장이 컬럼과 흔적을 함께 남긴다 — 컬럼에는 출처를 담을 자리가 없다', async () => {
    const id = 'a3333333-3333-4333-8333-333333333333';
    await saveSpec(db, {
      partId: id,
      key: 'release_year',
      value: 2021,
      sourceUrl: 'https://example.test/mb',
    });

    const [row] = await db.execute<{ release_year: number }>(
      sql`select release_year from parts where id = ${id}`,
    );
    expect(row?.release_year, '컬럼에 들어가지 않으면 규칙이 읽지 못한다').toBe(2021);

    const detail = await partWithSpecs(db, id);
    const trace = detail?.specs.find((x) => x.key === 'release_year');
    expect(trace?.value, '흔적이 없으면 사람이 넣었다는 증거가 사라진다').toBe(2021);
    expect(trace?.sourceUrl).toBe('https://example.test/mb');
    expect(trace?.verifiedAt).not.toBeNull();

    // 「비어 있음」 목록에서도 빠져야 한다
    expect(detail?.missing.map((m) => m.specKey)).not.toContain('release_year');
    expect(await gapCounts(db, 'CPU', 'release_year')).toEqual({ missing: 0, withSource: 0 });
  });

  it('출처 없이 컬럼을 저장할 수 없다', async () => {
    await expect(
      saveSpec(db, {
        partId: 'a1111111-1111-4111-8111-111111111111',
        key: 'release_year',
        value: 2020,
        sourceUrl: '   ',
      }),
    ).rejects.toThrow();
  });

  it('정수가 아닌 연도를 받지 않는다', async () => {
    await expect(
      saveSpec(db, {
        partId: 'a1111111-1111-4111-8111-111111111111',
        key: 'release_year',
        value: 2020.5,
        sourceUrl: 'https://example.test/x',
      }),
    ).rejects.toThrow();
  });

  // --- 저장의 마지막 문 --------------------------------------------------

  it('★ 카테고리가 어긋나는 필드를 저장하지 않는다', async () => {
    // 없을 때 확인해 보니 CPU에 supported_psu_form_factors가 그대로 들어갔다.
    // 그러면 결측 집계가 그 CPU를 "케이스 필드를 가진 것"으로 센다.
    await expect(
      saveSpec(db, {
        partId: 'a1111111-1111-4111-8111-111111111111', // CPU
        key: 'supported_psu_form_factors', // PCCase 필드
        value: ['ATX'],
        sourceUrl: 'https://example.test/x',
      }),
    ).rejects.toThrow(/저장할 수 없습니다/);
  });

  it('없는 부품에는 저장하지 않는다', async () => {
    await expect(
      saveSpec(db, {
        partId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        key: 'socket',
        value: 'AM5',
        sourceUrl: 'https://example.test/x',
      }),
    ).rejects.toThrow(/없는 부품/);
  });

  it('★ 선언된 범위 밖의 출시 연도를 막는다 — int4를 넘기면 DB가 던진다', async () => {
    const id = 'a1111111-1111-4111-8111-111111111111';
    for (const bad of [1, 999999999, 1e12]) {
      await expect(
        saveSpec(db, { partId: id, key: 'release_year', value: bad, sourceUrl: 'https://example.test/y' }),
        String(bad),
      ).rejects.toThrow(/출시 연도는/);
    }
    // 범위 안은 들어간다
    await saveSpec(db, {
      partId: id,
      key: 'release_year',
      value: 2024,
      sourceUrl: 'https://example.test/y',
    });
    const [row] = await db.execute<{ y: number }>(
      sql`select release_year as y from parts where id = ${id}`,
    );
    expect(row?.y).toBe(2024);
  });

  it('빈 DB에서도 던지지 않는다', async () => {
    await db.execute(sql`delete from parts`);
    expect(await fieldGapSummary(db)).toEqual([]);
  });
});
