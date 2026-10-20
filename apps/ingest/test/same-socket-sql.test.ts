/**
 * 부품 페이지의 호환 목록 「소켓이 같은 메인보드/CPU」 (명세 §8).
 *
 * 문자열로 대조하던 때는 `TR4` 보드 23개와 `sTR4` CPU 10개가 서로를 찾지 못해
 * 목록이 비었고, 빈 목록은 섹션째 숨겨져 **아무 표시 없이** 사라졌다. 규칙 1과
 * 고르기는 같은 소켓으로 본다 (이슈 #16). 같은 표(`sockets.ts`)를 쓰는지 본다.
 *
 * DB가 필요하다. `DATABASE_URL`이 없으면 건너뛴다 — CI에는 항상 있다.
 */

import { createDb } from '@buildfit/db';
import { partsOnSameSocket } from '@buildfit/db/part';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createScratchDb, type Scratch } from './helpers/scratch-db';

const describeIfDb = process.env['DATABASE_URL'] ? describe : describe.skip;

if (process.env['CI'] === 'true' && !process.env['DATABASE_URL']) {
  throw new Error('CI인데 DATABASE_URL이 없다. 호환 목록 검증이 조용히 빠진다.');
}

const id = (n: number) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describeIfDb('소켓이 같은 부품 — 호환 목록 (§8)', () => {
  let scratch: Scratch;
  let db: ReturnType<typeof createDb>['db'];
  let close: () => Promise<void>;

  async function part(n: number, category: string, socket: string, duplicateOf?: number) {
    const pid = id(n);
    await db.execute(sql`
      insert into parts (id, slug, category, brand, model_name, opendb_id, duplicate_of)
      values (${pid}, ${`s-${n}`}, ${category}, 'Test', ${`part ${n}`}, ${`od-${pid}`},
              ${duplicateOf === undefined ? null : id(duplicateOf)})`);
    await db.execute(sql`
      insert into part_specs (part_id, key, value) values (${pid}, 'socket', ${JSON.stringify(socket)}::jsonb)`);
  }

  const slugs = (rows: readonly { slug: string }[]) => rows.map((r) => r.slug).sort();

  beforeAll(async () => {
    scratch = await createScratchDb();
    const made = createDb(scratch.url, { max: 2 });
    db = made.db;
    close = () => made.client.end();

    await part(1, 'Motherboard', 'TR4');
    await part(2, 'Motherboard', 'sTR4');
    await part(3, 'CPU', 'sTR4');
    await part(4, 'CPU', 'sTR4');
    await part(5, 'Motherboard', 'AM5');
    await part(6, 'CPU', 'AM5');
    await part(7, 'CPU', 'sTRX4');
    await part(8, 'CPU', 'sTR4', 3);
  }, 60_000);

  afterAll(async () => {
    await close?.();
    await scratch?.drop();
  });

  it('★ TR4 보드에 sTR4 CPU가 나온다 — 같은 소켓의 다른 표기', async () => {
    const rows = await partsOnSameSocket(db, { category: 'CPU', socket: 'TR4' });
    expect(slugs(rows)).toEqual(['s-3', 's-4']);
  });

  it('★ sTR4 CPU에 TR4·sTR4 보드가 둘 다 나온다', async () => {
    const rows = await partsOnSameSocket(db, { category: 'Motherboard', socket: 'sTR4' });
    expect(slugs(rows)).toEqual(['s-1', 's-2']);
  });

  it('등가 표에 없는 소켓은 묶지 않는다 — sTRX4는 sTR4가 아니다', async () => {
    const rows = await partsOnSameSocket(db, { category: 'CPU', socket: 'sTR4' });
    expect(slugs(rows)).not.toContain('s-7');
  });

  it('표에 없는 소켓은 전과 같다 — 문자열 일치', async () => {
    expect(slugs(await partsOnSameSocket(db, { category: 'CPU', socket: 'AM5' }))).toEqual(['s-6']);
    expect(slugs(await partsOnSameSocket(db, { category: 'Motherboard', socket: 'AM5' }))).toEqual(['s-5']);
  });

  it('자기 자신과 중복 레코드는 빠진다', async () => {
    const rows = await partsOnSameSocket(db, { category: 'CPU', socket: 'sTR4', excludePartId: id(3) });
    expect(slugs(rows)).toEqual(['s-4']);
  });
});
