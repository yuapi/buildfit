/**
 * 스스로 모순인 메모리 레코드 — 이슈 #20.
 *
 * 1. 산술(모듈 수 × 모듈 용량 = 총 용량)이 틀리거나 이름의 `(NxMGB)`와 다르면 고른다
 * 2. 어느 값이 틀렸는지 고르지 않는다 — 세 값에 모두 세운다
 * 3. 이름에 단위 없는 `(24x2)`는 읽지 않는다 (순서를 모른다)
 * 4. 사람이 확인한 행에는 세우지 않는다
 * 5. 중복 불일치 검사의 거두기가 지우지 않고, 업스트림이 고치면 거둔다
 * 6. 판정은 그대로이고 「검증 중」만 붙는다 (ADR-0021)
 *
 * DB가 필요하다. `DATABASE_URL`이 없으면 건너뛴다 — CI에는 항상 있다.
 */

import { evaluate } from '@buildfit/compat';
import { createDb } from '@buildfit/db';
import { loadBuild } from '@buildfit/db/build';
import { inconsistentRamKits, saveSpec } from '@buildfit/db/queries';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { flagConflictingSpecs, markDuplicates } from '../src/duplicates';
import { flagInconsistentRam } from '../src/plausibility';
import { createScratchDb, type Scratch } from './helpers/scratch-db';

const describeIfDb = process.env['DATABASE_URL'] ? describe : describe.skip;

if (process.env['CI'] === 'true' && !process.env['DATABASE_URL']) {
  throw new Error('CI인데 DATABASE_URL이 없다. 메모리 모순 검증이 조용히 빠진다.');
}

const ARITH = 'b0000000-0000-4000-8000-000000000001'; // 2 × 24 ≠ 64
const NAME = 'b0000000-0000-4000-8000-000000000002'; // 이름 2x16인데 모듈 수 1
const FINE = 'b0000000-0000-4000-8000-000000000003';
const UNITLESS = 'b0000000-0000-4000-8000-000000000004'; // (24x2) — 읽지 않는다
const HUMAN = 'b0000000-0000-4000-8000-000000000005'; // 셋 다 사람이 확인
const BOARD = 'b0000000-0000-4000-8000-000000000006';

describeIfDb('스스로 모순인 메모리 (이슈 #20)', () => {
  let scratch: Scratch;
  let db: ReturnType<typeof createDb>['db'];
  let close: () => Promise<void>;

  async function kit(id: string, name: string, count: number, module: number, total: number) {
    await db.execute(sql`
      insert into parts (id, slug, category, brand, model_name, opendb_id)
      values (${id}, ${id}, 'RAM', 'Test', ${name}, ${`od-${id}`})`);
    await db.execute(sql`
      insert into part_specs (part_id, key, value) values
        (${id}, 'module_count', to_jsonb(${count}::int)),
        (${id}, 'module_capacity_gb', to_jsonb(${module}::int)),
        (${id}, 'capacity_gb', to_jsonb(${total}::int)),
        (${id}, 'ram_type', '"DDR5"'::jsonb)`);
  }

  async function flagged(id: string): Promise<Record<string, boolean>> {
    const rows = await db.execute<{ key: string; disputed: boolean }>(sql`
      select key, disputed from part_specs
      where part_id = ${id} and key in ('module_count', 'module_capacity_gb', 'capacity_gb')`);
    return Object.fromEntries(rows.map((r) => [r.key, r.disputed]));
  }

  const ALL = { module_count: true, module_capacity_gb: true, capacity_gb: true };
  const NONE = { module_count: false, module_capacity_gb: false, capacity_gb: false };

  beforeAll(async () => {
    scratch = await createScratchDb();
    const made = createDb(scratch.url, { max: 2 });
    db = made.db;
    close = () => made.client.end();

    await kit(ARITH, 'ADATA LANCER DDR5-6000 48 (2x24GB)', 2, 24, 64);
    await kit(NAME, 'Silicon Power DDR5 32GB (2x16GB)', 1, 32, 32);
    await kit(FINE, 'Corsair Vengeance DDR5-6000 32GB (2x16GB)', 2, 16, 32);
    await kit(UNITLESS, 'KINGBANK DDR5 48GB(24x2)', 2, 24, 48);
    await kit(HUMAN, 'Checked DDR5 32GB (2x16GB)', 1, 32, 32);
    await db.execute(sql`
      update part_specs set source_url = 'https://example.com/checked'
      where part_id = ${HUMAN} and key in ('module_count', 'module_capacity_gb', 'capacity_gb')`);

    await db.execute(sql`
      insert into parts (id, slug, category, brand, model_name, opendb_id)
      values (${BOARD}, 'board', 'Motherboard', 'Test', 'Board', 'od-board')`);
    await db.execute(sql`
      insert into part_specs (part_id, key, value) values
        (${BOARD}, 'memory_type', '"DDR5"'::jsonb),
        (${BOARD}, 'memory_slots', '4'::jsonb),
        (${BOARD}, 'memory_max_gb', '192'::jsonb)`);

    await markDuplicates(db);
    await flagConflictingSpecs(db);
    await flagInconsistentRam(db);
  }, 120_000);

  afterAll(async () => {
    await close();
    await scratch.drop();
  });

  it('산술이 틀리면 세 값에 모두 세운다 — 어느 것이 틀렸는지 고르지 않는다', async () => {
    expect(await flagged(ARITH)).toEqual(ALL);
  });

  it('산술은 맞아도 이름의 (NxMGB)와 다르면 세운다', async () => {
    expect(await flagged(NAME)).toEqual(ALL);
  });

  it('맞는 레코드와 단위 없는 이름은 건드리지 않는다', async () => {
    expect(await flagged(FINE)).toEqual(NONE);
    expect(await flagged(UNITLESS)).toEqual(NONE);
  });

  it('셋 다 사람이 확인했으면 이름과 달라도 고르지 않는다', async () => {
    expect(await flagged(HUMAN)).toEqual(NONE);
  });

  it('어드민 목록이 적재가 표시한 레코드와 같다', async () => {
    const listed = (await inconsistentRamKits(db)).map((k) => k.partId).sort();
    expect(listed).toEqual([ARITH, NAME].sort());
    const arith = (await inconsistentRamKits(db)).find((k) => k.partId === ARITH);
    expect(arith).toMatchObject({ moduleCount: 2, moduleCapacityGb: 24, capacityGb: 64, nameCount: 2, nameModuleGb: 24 });
  });

  it('중복 불일치 검사의 거두기가 지우지 않는다', async () => {
    const r = await flagConflictingSpecs(db);
    expect(r.retracted).toBe(0);
    expect(await flagged(ARITH)).toEqual(ALL);
  });

  it('판정은 그대로 두고 「검증 중」만 붙인다', async () => {
    const build = await loadBuild(db, { motherboard: BOARD, ram: [ARITH] });
    const results = evaluate(build).results;
    const r3 = results.find((r) => r.ruleId === 3);
    const r16 = results.find((r) => r.ruleId === 16);
    expect(r3?.verdict).toBe('pass');
    expect(r3?.contested?.map((c) => c.field)).toEqual(['모듈 개수']);
    expect(r16?.verdict).toBe('pass');
    expect(r16?.contested?.map((c) => c.field)).toEqual(['용량']);
  });

  it('업스트림이 고치면 다음 적재에 거둔다', async () => {
    // OpenDB가 총 용량을 48로 고쳤다
    await db.execute(sql`update part_specs set value = '48'::jsonb where part_id = ${ARITH} and key = 'capacity_gb'`);
    await flagConflictingSpecs(db);
    await flagInconsistentRam(db);
    expect(await flagged(ARITH)).toEqual(NONE);
  });

  it('사람이 한 값을 고치면 그 행만 풀리고 모순이 남으면 나머지는 선다', async () => {
    await saveSpec(db, { partId: NAME, key: 'capacity_gb', value: 32, sourceUrl: 'https://example.com/sp' });
    await flagConflictingSpecs(db);
    await flagInconsistentRam(db);
    expect(await flagged(NAME)).toEqual({ module_count: true, module_capacity_gb: true, capacity_gb: false });
  });
});
