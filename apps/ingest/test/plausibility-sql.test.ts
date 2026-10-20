/**
 * 소켓보다 앞선 출시 연도 — 이슈 #18.
 *
 * 지켜야 할 것:
 *
 * 1. 빈 해를 사이에 두고 앞에 홀로 떨어진 무리만 고른다
 * 2. 같은 소켓의 다른 표기(`TR4`/`sTR4`)를 한 분포로 센다
 * 3. 사람이 출처와 함께 넣은 연도는 고르지 않는다
 * 4. 적재의 표시와 어드민 목록이 같은 집합이다
 * 5. 중복 불일치 검사의 거두기가 이 표시를 지우지 않는다
 * 6. 판정은 그대로이고 「검증 중」만 붙는다 (ADR-0021)
 *
 * DB가 필요하다. `DATABASE_URL`이 없으면 건너뛴다 — CI에는 항상 있다.
 */

import { evaluate } from '@buildfit/compat';
import { createDb } from '@buildfit/db';
import { loadBuild } from '@buildfit/db/build';
import { implausibleReleaseYears, saveSpec } from '@buildfit/db/queries';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { flagConflictingSpecs, markDuplicates } from '../src/duplicates';
import { flagImplausibleYears } from '../src/plausibility';
import { createScratchDb, type Scratch } from './helpers/scratch-db';

const describeIfDb = process.env['DATABASE_URL'] ? describe : describe.skip;

if (process.env['CI'] === 'true' && !process.env['DATABASE_URL']) {
  throw new Error('CI인데 DATABASE_URL이 없다. 출시 연도 검증이 조용히 빠진다.');
}

const EARLY_CPU = 'a0000000-0000-4000-8000-000000000001';
const EARLY_CPU_DUP = 'a0000000-0000-4000-8000-000000000002';
const EARLIER_BOARD = 'a0000000-0000-4000-8000-000000000003';
const BOARD_2022 = 'a0000000-0000-4000-8000-000000000004';
const HUMAN_CPU = 'a0000000-0000-4000-8000-000000000005';
const SMALL_EARLY = 'a0000000-0000-4000-8000-000000000006';
const TR4_EARLY = 'a0000000-0000-4000-8000-000000000007';

describeIfDb('소켓보다 앞선 출시 연도 (이슈 #18)', () => {
  let scratch: Scratch;
  let db: ReturnType<typeof createDb>['db'];
  let close: () => Promise<void>;

  /** 이름이 모두 다른 대표 레코드를 한 소켓에 n건 깐다 */
  async function bulk(socket: string, years: readonly number[], per: number, tag: string) {
    for (const year of years) {
      for (let i = 0; i < per; i++) {
        const name = `${tag} ${year} ${i}`;
        await db.execute(sql`
          with p as (
            insert into parts (slug, category, brand, model_name, release_year, opendb_id)
            values (${name.replace(/\s+/g, '-').toLowerCase()}, 'Motherboard', 'Test', ${name},
                    ${year}, ${`od-${name}`})
            returning id
          )
          insert into part_specs (part_id, key, value)
          select id, 'socket', to_jsonb(${socket}::text) from p
        `);
      }
    }
  }

  async function flaggedIds(): Promise<string[]> {
    const rows = await db.execute<{ id: string }>(sql`
      select part_id::text as id from part_specs
      where key = 'release_year' and disputed order by 1
    `);
    return rows.map((r) => r.id);
  }

  beforeAll(async () => {
    scratch = await createScratchDb();
    const made = createDb(scratch.url, { max: 2 });
    db = made.db;
    close = () => made.client.end();

    // AM5: 2022~2024에 60건. 앞에 2019·2020이 떨어져 있다 (2021은 비었다).
    // 2019 → 2020은 한 해 차이라 그 자체로는 조건을 못 채우지만 더 이르다 — 같이 골라야 한다.
    await bulk('AM5', [2022, 2023, 2024], 20, 'am5');
    await db.execute(sql`
      insert into parts (id, slug, category, brand, model_name, release_year, opendb_id) values
        (${EARLY_CPU}, 'cpu-early', 'CPU', 'AMD', 'Ryzen 5 7500F', 2020, 'aa-early'),
        (${EARLY_CPU_DUP}, 'cpu-early-dup', 'CPU', 'AMD', 'Ryzen 5 7500F', 2020, 'zz-early'),
        (${EARLIER_BOARD}, 'board-2019', 'Motherboard', 'ASUS', 'B650 odd', 2019, 'aa-2019'),
        (${BOARD_2022}, 'board-2022', 'Motherboard', 'MSI', 'B650 fine', 2022, 'aa-2022'),
        (${HUMAN_CPU}, 'cpu-human', 'CPU', 'AMD', 'Ryzen checked', 2020, 'aa-human'),
        (${SMALL_EARLY}, 'small-early', 'CPU', 'Intel', 'Small early', 2015, 'aa-small'),
        (${TR4_EARLY}, 'tr4-early', 'CPU', 'AMD', 'TR early', 2014, 'aa-tr4')
    `);
    await db.execute(sql`
      insert into part_specs (part_id, key, value) values
        (${EARLY_CPU}, 'socket', '"AM5"'::jsonb),
        (${EARLY_CPU_DUP}, 'socket', '"AM5"'::jsonb),
        (${EARLIER_BOARD}, 'socket', '"AM5"'::jsonb),
        (${BOARD_2022}, 'socket', '"AM5"'::jsonb),
        (${BOARD_2022}, 'memory_type', '"DDR5"'::jsonb),
        (${BOARD_2022}, 'bios_flashback', 'false'::jsonb),
        (${HUMAN_CPU}, 'socket', '"AM5"'::jsonb),
        (${SMALL_EARLY}, 'socket', '"LGA 9999"'::jsonb),
        (${TR4_EARLY}, 'socket', '"TR4"'::jsonb)
    `);
    // 사람이 출처와 함께 넣은 연도 — 분포에는 세되 고르지 않는다
    await db.execute(sql`
      insert into part_specs (part_id, key, value, source_url) values
        (${HUMAN_CPU}, 'release_year', '2020'::jsonb, 'https://example.com/spec')
    `);
    // 연도가 있는 레코드가 11건뿐인 소켓. 1건이 9%라 비율에서 먼저 걸러진다 —
    // 20건 하한은 5%에서 따로 작동하지 않는다 (research §3.1)
    await bulk('LGA 9999', [2020], 10, 'small');
    // TR4 한 건 + sTR4 25건. 표기를 접지 않으면 TR4는 1건짜리 소켓이라 안 잡힌다
    await bulk('sTR4', [2017, 2018], 13, 'str4');

    await markDuplicates(db);
    await flagConflictingSpecs(db);
    await flagImplausibleYears(db);
  }, 120_000);

  afterAll(async () => {
    await close();
    await scratch.drop();
  });

  it('빈 해 앞의 무리를 고른다 — 더 이른 해와 중복 레코드까지', async () => {
    const flagged = await flaggedIds();
    expect(flagged).toContain(EARLY_CPU);
    expect(flagged).toContain(EARLY_CPU_DUP);
    expect(flagged).toContain(EARLIER_BOARD);
    expect(flagged).not.toContain(BOARD_2022);
  });

  it('사람이 출처와 함께 넣은 연도는 고르지 않는다', async () => {
    expect(await flaggedIds()).not.toContain(HUMAN_CPU);
    const [row] = await db.execute<{ disputed: boolean; source_url: string }>(sql`
      select disputed, source_url from part_specs where part_id = ${HUMAN_CPU} and key = 'release_year'
    `);
    expect(row).toEqual({ disputed: false, source_url: 'https://example.com/spec' });
  });

  it('분포가 작은 소켓에서는 한 건도 앞선 무리가 되지 못한다', async () => {
    expect(await flaggedIds()).not.toContain(SMALL_EARLY);
  });

  it('TR4와 sTR4를 한 분포로 센다', async () => {
    expect(await flaggedIds()).toContain(TR4_EARLY);
  });

  it('표시한 행의 출처는 그 레코드의 OpenDB 파일이다', async () => {
    const [row] = await db.execute<{ source_url: string; value: unknown }>(sql`
      select source_url, value from part_specs where part_id = ${EARLY_CPU} and key = 'release_year'
    `);
    expect(row?.value).toBe(2020);
    expect(row?.source_url).toBe(
      'https://github.com/buildcores/buildcores-open-db/blob/main/open-db/CPU/aa-early.json',
    );
  });

  it('어드민 목록이 적재가 표시한 집합과 같다', async () => {
    const listed = (await implausibleReleaseYears(db)).map((y) => y.partId).sort();
    expect(listed).toEqual(await flaggedIds());
    const early = (await implausibleReleaseYears(db)).find((y) => y.partId === EARLY_CPU);
    expect(early).toMatchObject({ socket: 'AM5', year: 2020, nextYear: 2022 });
  });

  it('중복 불일치 검사의 거두기가 이 표시를 지우지 않는다', async () => {
    const before = await flaggedIds();
    const result = await flagConflictingSpecs(db);
    expect(result.retracted).toBe(0);
    expect(await flaggedIds()).toEqual(before);
  });

  it('판정은 그대로 두고 「검증 중」만 붙인다', async () => {
    const build = await loadBuild(db, { cpu: EARLY_CPU, motherboard: BOARD_2022 });
    const r12 = evaluate(build).results.find((r) => r.ruleId === 12);
    // 원본 값(2020 ≤ 2022)으로 판정한다. 값을 지우거나 unknown으로 내리지 않는다
    expect(r12?.verdict).toBe('pass');
    expect(r12?.contested?.map((c) => c.field)).toEqual(['출시 연도']);
  });

  it('사람이 연도를 채우면 다시 표시하지 않는다', async () => {
    await saveSpec(db, {
      partId: EARLY_CPU,
      key: 'release_year',
      value: 2023,
      sourceUrl: 'https://example.com/7500f',
    });
    await flagImplausibleYears(db);
    expect(await flaggedIds()).not.toContain(EARLY_CPU);
    const [row] = await db.execute<{ release_year: number }>(
      sql`select release_year from parts where id = ${EARLY_CPU}`,
    );
    expect(row?.release_year).toBe(2023);
  });
});
