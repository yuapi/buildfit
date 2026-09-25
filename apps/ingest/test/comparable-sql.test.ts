/**
 * 「비교해 볼 만한 부품」 — 살 때 서로 대신할 수 있는 것끼리 (명세 §8, 이슈 #54).
 *
 * 1. 파워는 폼팩터 **와** 정격 출력이 같아야 한다 — 750W에 1600W를 내놓지 않는다
 * 2. 메모리는 DDR 규격 **과** 총 용량이 같아야 한다
 * 3. 대표 레코드만 — 중복은 후보가 아니다
 * 4. 축 하나라도 모르면 후보를 내지 않는다
 * 5. 스펙 하나로 찾는 `partsMatchingSpec`은 전과 같다
 *
 * DB가 필요하다. `DATABASE_URL`이 없으면 건너뛴다 — CI에는 항상 있다.
 */

import { createDb } from '@buildfit/db';
import { comparableParts, partsMatchingSpec } from '@buildfit/db/part';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createScratchDb, type Scratch } from './helpers/scratch-db';

const describeIfDb = process.env['DATABASE_URL'] ? describe : describe.skip;

if (process.env['CI'] === 'true' && !process.env['DATABASE_URL']) {
  throw new Error('CI인데 DATABASE_URL이 없다. 비교 후보 검증이 조용히 빠진다.');
}

const id = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describeIfDb('비교 후보의 축 (이슈 #54)', () => {
  let scratch: Scratch;
  let db: ReturnType<typeof createDb>['db'];
  let close: () => Promise<void>;

  async function part(n: number, category: string, specs: Record<string, unknown>, duplicateOf?: number) {
    const pid = id(n);
    await db.execute(sql`
      insert into parts (id, slug, category, brand, model_name, opendb_id, duplicate_of)
      values (${pid}, ${`p-${n}`}, ${category}, 'Test', ${`part ${n}`}, ${`od-${pid}`},
              ${duplicateOf === undefined ? null : id(duplicateOf)})`);
    for (const [key, value] of Object.entries(specs)) {
      await db.execute(sql`
        insert into part_specs (part_id, key, value) values (${pid}, ${key}, ${JSON.stringify(value)}::jsonb)`);
    }
  }

  /** 페이지가 넘기는 모양 그대로 */
  const subject = (n: number, category: string, specs: Record<string, unknown>) => ({
    id: id(n),
    category,
    specs: Object.entries(specs).map(([key, value]) => ({ key, value })),
  });

  beforeAll(async () => {
    scratch = await createScratchDb();
    const made = createDb(scratch.url, { max: 2 });
    db = made.db;
    close = () => made.client.end();

    await part(1, 'PSU', { form_factor: 'ATX', wattage_w: 750 });
    await part(2, 'PSU', { form_factor: 'ATX', wattage_w: 750 });
    await part(3, 'PSU', { form_factor: 'ATX', wattage_w: 1600 });
    await part(4, 'PSU', { form_factor: 'SFX', wattage_w: 750 });
    await part(5, 'PSU', { form_factor: 'ATX', wattage_w: 750 }, 2); // 2의 중복

    await part(11, 'RAM', { ram_type: 'DDR5', capacity_gb: 32 });
    await part(12, 'RAM', { ram_type: 'DDR5', capacity_gb: 32 });
    await part(13, 'RAM', { ram_type: 'DDR5', capacity_gb: 96 });
    await part(14, 'RAM', { ram_type: 'DDR4', capacity_gb: 32 });
  });

  afterAll(async () => {
    await close?.();
    await scratch?.drop();
  });

  it('★ 파워는 폼팩터와 정격 출력이 모두 같은 것만 — 1600W·SFX·중복은 빠진다', async () => {
    const got = await comparableParts(db, subject(1, 'PSU', { form_factor: 'ATX', wattage_w: 750 }));
    expect(got.map((p) => p.slug)).toEqual(['p-2']);
  });

  it('★ 메모리는 규격과 총 용량이 모두 같은 것만', async () => {
    const got = await comparableParts(db, subject(11, 'RAM', { ram_type: 'DDR5', capacity_gb: 32 }));
    expect(got.map((p) => p.slug)).toEqual(['p-12']);
  });

  it('축 하나라도 모르면 후보를 내지 않는다', async () => {
    expect(await comparableParts(db, subject(1, 'PSU', { form_factor: 'ATX' }))).toEqual([]);
  });

  it('스펙 하나로 찾기는 전과 같다', async () => {
    const got = await partsMatchingSpec(db, { category: 'PSU', specKey: 'wattage_w', value: 750 });
    expect(got.map((p) => p.slug).sort()).toEqual(['p-1', 'p-2', 'p-4']);
  });
});
