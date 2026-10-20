/**
 * Blender 측정값 적재 — ADR-0023.
 *
 * CPU는 모델 이름, GPU는 칩(`chipset`)으로 붙인다. 같은 칩의 AIB 모델은 모두 같은 값을
 * 받는다. 다시 적재하면 이 축의 옛 행을 걷는다.
 *
 * DB가 필요하다. `DATABASE_URL`이 없으면 건너뛴다 — CI에는 항상 있다.
 */

import { createDb } from '@buildfit/db';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BLENDER_AXIS, loadBlenderBenchmarks, type DeviceScore } from '../src/benchmarks';
import { createScratchDb, type Scratch } from './helpers/scratch-db';

const describeIfDb = process.env['DATABASE_URL'] ? describe : describe.skip;

if (process.env['CI'] === 'true' && !process.env['DATABASE_URL']) {
  throw new Error('CI인데 DATABASE_URL이 없다. 측정값 적재 검증이 조용히 빠진다.');
}

const CPU = 'e0000000-0000-4000-8000-000000000001';
const GPU_A = 'e0000000-0000-4000-8000-000000000002';
const GPU_B = 'e0000000-0000-4000-8000-000000000003';
const GPU_OTHER = 'e0000000-0000-4000-8000-000000000004';

const score = (kind: 'cpu' | 'gpu', key: string, median: number): DeviceScore => ({
  kind, key, median, runs: 10, backend: kind === 'cpu' ? 'CPU' : 'OPTIX', deviceName: `raw ${key}`,
});

describeIfDb('Blender 측정값 적재 (ADR-0023)', () => {
  let scratch: Scratch;
  let db: ReturnType<typeof createDb>['db'];
  let close: () => Promise<void>;

  const part = async (id: string, category: string, name: string, chipset?: string) => {
    await db.execute(sql`insert into parts (id, slug, category, brand, model_name, opendb_id)
      values (${id}, ${id}, ${category}, 'Test', ${name}, ${`od-${id}`})`);
    if (chipset) await db.execute(sql`insert into part_specs (part_id, key, value) values (${id}, 'chipset', to_jsonb(${chipset}::text))`);
  };
  const values = async () =>
    Object.fromEntries(
      (await db.execute<{ part_id: string; value: string; per_chip: boolean }>(sql`
        select part_id, value, per_chip from part_benchmarks where axis = ${BLENDER_AXIS}`)).map((r) => [r.part_id, [Number(r.value), r.per_chip]]),
    );

  beforeAll(async () => {
    scratch = await createScratchDb();
    const made = createDb(scratch.url, { max: 2 });
    db = made.db;
    close = () => made.client.end();
    await part(CPU, 'CPU', 'AMD Ryzen 7 9700X');
    await part(GPU_A, 'GPU', 'MSI GeForce RTX 4070 VENTUS 2X', 'GeForce RTX 4070');
    await part(GPU_B, 'GPU', 'ASUS DUAL RTX 4070 OC', 'GeForce RTX 4070');
    await part(GPU_OTHER, 'GPU', 'ASUS TUF RTX 4070 SUPER', 'GeForce RTX 4070 SUPER');
  }, 120_000);

  afterAll(async () => {
    await close();
    await scratch.drop();
  });

  it('★ CPU는 이름, GPU는 칩으로 붙고 같은 칩의 제품은 모두 같은 값이다', async () => {
    const r = await loadBlenderBenchmarks(db, [score('cpu', 'ryzen 7 9700x', 309), score('gpu', 'rtx 4070', 5219)], '2026-09-24');
    expect(r).toEqual({ parts: 3, devices: 2 });
    expect(await values()).toEqual({ [CPU]: [309, false], [GPU_A]: [5219, true], [GPU_B]: [5219, true] });
  });

  it('다른 칩(4070 SUPER)에는 붙지 않는다', async () => {
    expect((await values())[GPU_OTHER]).toBeUndefined();
  });

  it('다시 적재하면 옛 값이 남지 않는다 — 스냅숏에서 사라진 장치', async () => {
    await loadBlenderBenchmarks(db, [score('gpu', 'rtx 4070', 5300)], '2026-09-25');
    expect(await values()).toEqual({ [GPU_A]: [5300, true], [GPU_B]: [5300, true] });
  });
});
