/**
 * 규칙 12의 보드 연도 하한 — 이슈 #28, compat-rules §12.5.
 *
 * `loadBuild`가 보드 소켓의 **첫 CPU 연도**를 카탈로그에서 계산한다.
 *
 * 1. 같은 소켓 CPU들의 가장 이른 연도다
 * 2. 「검증 중」 연도는 뺀다 — 7500F(AM5, 2020년)가 하한을 끌어내리면 쓸모가 없다
 * 3. 중복 레코드(대표 아님)는 뺀다
 * 4. 같은 소켓의 다른 표기(TR4/sTR4)를 함께 본다
 * 5. 보드 연도가 없어도 소켓 첫해 CPU는 통과, 후속 세대는 판정 불가
 *
 * DB가 필요하다. `DATABASE_URL`이 없으면 건너뛴다 — CI에는 항상 있다.
 */

import { evaluate } from '@buildfit/compat';
import { createDb } from '@buildfit/db';
import { loadBuild } from '@buildfit/db/build';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createScratchDb, type Scratch } from './helpers/scratch-db';

const describeIfDb = process.env['DATABASE_URL'] ? describe : describe.skip;

if (process.env['CI'] === 'true' && !process.env['DATABASE_URL']) {
  throw new Error('CI인데 DATABASE_URL이 없다. 규칙 12 하한 검증이 조용히 빠진다.');
}

const id = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const R7000 = id(1); // AM5 2022 — 첫해
const R9000 = id(2); // AM5 2024 — 후속 세대
const R7500F = id(3); // AM5 2020 — 「검증 중」
const DUP = id(4); // AM5 2019 — 중복(대표 아님)
const TR_CPU = id(5); // sTR4 2017
const AM5_BOARD = id(10); // 연도 없음
const TR4_BOARD = id(11); // TR4 표기, 연도 없음

describeIfDb('규칙 12 — 소켓의 첫 CPU 연도가 보드 연도의 하한이다 (이슈 #28)', () => {
  let scratch: Scratch;
  let db: ReturnType<typeof createDb>['db'];
  let close: () => Promise<void>;

  async function part(pid: string, category: string, name: string, year: number | null, socket: string) {
    await db.execute(sql`
      insert into parts (id, slug, category, brand, model_name, opendb_id, release_year)
      values (${pid}, ${pid}, ${category}, 'Test', ${name}, ${`od-${pid}`}, ${year})`);
    await db.execute(sql`
      insert into part_specs (part_id, key, value) values (${pid}, 'socket', to_jsonb(${socket}::text))`);
  }

  beforeAll(async () => {
    scratch = await createScratchDb();
    const made = createDb(scratch.url, { max: 2 });
    db = made.db;
    close = () => made.client.end();

    await part(R7000, 'CPU', 'Ryzen 7 7700X', 2022, 'AM5');
    await part(R9000, 'CPU', 'Ryzen 7 9700X', 2024, 'AM5');
    await part(R7500F, 'CPU', 'Ryzen 5 7500F', 2020, 'AM5');
    await db.execute(sql`
      insert into part_specs (part_id, key, value, disputed) values (${R7500F}, 'release_year', '2020'::jsonb, true)`);
    await part(DUP, 'CPU', 'Ryzen 7 7700X (dup)', 2019, 'AM5');
    await db.execute(sql`update parts set duplicate_of = ${R7000} where id = ${DUP}`);
    await part(TR_CPU, 'CPU', 'Threadripper 1950X', 2017, 'sTR4');
    await part(AM5_BOARD, 'Motherboard', 'B650 Board', null, 'AM5');
    await part(TR4_BOARD, 'Motherboard', 'X399 Board', null, 'TR4');
  }, 120_000);

  afterAll(async () => {
    await close();
    await scratch.drop();
  });

  it('★ 「검증 중」 연도와 중복 레코드를 빼고 가장 이른 연도를 하한으로 삼는다', async () => {
    const b = await loadBuild(db, { motherboard: AM5_BOARD });
    expect(b.motherboard?.socketFirstYear).toBe(2022);
  });

  it('같은 소켓의 다른 표기를 함께 본다 — TR4 보드에 sTR4 CPU', async () => {
    const b = await loadBuild(db, { motherboard: TR4_BOARD });
    expect(b.motherboard?.socketFirstYear).toBe(2017);
  });

  it('보드 연도가 없어도 소켓 첫해 CPU는 통과한다', async () => {
    const r = evaluate(await loadBuild(db, { cpu: R7000, motherboard: AM5_BOARD })).results;
    expect(r.find((x) => x.ruleId === 12)?.verdict).toBe('pass');
  });

  it('후속 세대 CPU는 여전히 판정 불가다 — 보드가 첫해 것일 수 있다', async () => {
    const r = evaluate(await loadBuild(db, { cpu: R9000, motherboard: AM5_BOARD })).results;
    expect(r.find((x) => x.ruleId === 12)?.verdict).toBe('unknown');
  });
});
