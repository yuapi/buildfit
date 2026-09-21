/**
 * 이름 검색 SQL — ADR-0017.
 *
 * **가장 중요한 성질은 두 개의 `squash`가 같다는 것이다.** 하나는 TS 모듈에,
 * 하나는 `parts.search_text` 생성 컬럼에 있다. 어긋나면 검색이 조용히 빗나간다
 * — 던지지도 않고, 그냥 결과가 안 나온다.
 *
 * DB가 필요하다. `DATABASE_URL`이 없으면 건너뛴다 — CI에는 항상 있다.
 */

import { squash } from '@buildfit/compat';
import { createDb } from '@buildfit/db';
import { searchCandidates } from '@buildfit/db/picker';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createScratchDb, type Scratch } from './helpers/scratch-db';

const describeIfDb = process.env['DATABASE_URL'] ? describe : describe.skip;

if (process.env['CI'] === 'true' && !process.env['DATABASE_URL']) {
  throw new Error('CI인데 DATABASE_URL이 없다. 검색 검증이 조용히 빠진다.');
}

/** 실제 카탈로그에 있는 모양들. 붙임·하이픈·™·괄호가 전부 섞여 있다 */
const FIXTURES = [
  'AMD Ryzen 7 9800X3D',
  'ASUS TUF Gaming GeForce RTX™ 4070 SUPER 12GB GDDR6X OC Edition',
  'NVIDIA Founders Edition GeForce RTX 5080',
  'Samsung 990 PRO 2TB',
  'be quiet! Pure Base 500DX Black',
  'G.SKILL Trident Z5 RGB 32GB (2x16GB) DDR5-6000',
];

describeIfDb('이름 검색 SQL (ADR-0017)', () => {
  let scratch: Scratch;
  let db: ReturnType<typeof createDb>['db'];
  let close: () => Promise<void>;

  beforeAll(async () => {
    scratch = await createScratchDb();
    const made = createDb(scratch.url, { max: 2 });
    db = made.db;
    close = () => made.client.end();

    await db.execute(sql`
      insert into parts (slug, category, brand, model_name, mpn) values
        ('p-cpu',  'CPU', 'AMD',      'AMD Ryzen 7 9800X3D', '100-100000084WOF'),
        ('p-gpu1', 'GPU', 'ASUS',     'ASUS TUF Gaming GeForce RTX™ 4070 SUPER 12GB GDDR6X OC Edition', 'TUF-RTX4070S-O12G'),
        ('p-gpu2', 'GPU', 'NVIDIA',   'NVIDIA Founders Edition GeForce RTX 5080', null),
        ('p-case', 'PCCase', 'be quiet!', 'be quiet! Pure Base 500DX Black', 'BGW37'),
        ('p-ram',  'RAM', 'G.SKILL',  'G.SKILL Trident Z5 RGB 32GB (2x16GB) DDR5-6000', 'F5-6000J3038F16GX2-TZ5RK')
    `);
  }, 60_000);

  afterAll(async () => {
    await close?.();
    await scratch?.drop();
  });

  const find = (category: string, query: string) =>
    searchCandidates(db, { category, query, constraints: [] });

  it('★ 생성 컬럼과 TS의 squash가 글자 하나까지 같다', async () => {
    // 이게 어긋나면 나머지 테스트가 다 통과해도 검색은 빗나간다.
    const rows = await db.execute<{ input: string; out: string }>(sql`
      select x as input,
             regexp_replace(lower(x), '[^a-z0-9]', '', 'g') as out
      from unnest(${sql.raw(`array[${FIXTURES.map((f) => `'${f.replace(/'/g, "''")}'`).join(',')}]`)}) as x
    `);
    expect(rows.length).toBe(FIXTURES.length);
    for (const r of rows) expect(r.out).toBe(squash(r.input));
  });

  it('★ search_text가 이름·브랜드·파트넘버를 모두 담는다', async () => {
    const [row] = await db.execute<{ search_text: string }>(
      sql`select search_text from parts where slug = 'p-cpu'`,
    );
    expect(row?.search_text).toBe(squash('AMD Ryzen 7 9800X3D AMD 100-100000084WOF'));
  });

  it('한글로 친 브랜드·제품군이 걸린다', async () => {
    expect((await find('CPU', '라이젠')).items).toHaveLength(1);
    expect((await find('GPU', '지포스')).items).toHaveLength(2);
    expect((await find('GPU', '엔비디아')).items).toHaveLength(1);
    expect((await find('PCCase', '비콰이엇')).items).toHaveLength(1);
    expect((await find('RAM', '지스킬')).items).toHaveLength(1);
  });

  it('무엇으로 바꿔 찾았는지 함께 돌려준다', async () => {
    const page = await find('GPU', '지포스 5080');
    expect(page.translated).toEqual([{ from: '지포스', to: 'geforce' }]);
    expect(page.items.map((i) => i.name)).toEqual(['NVIDIA Founders Edition GeForce RTX 5080']);
  });

  it('띄어쓰기와 하이픈이 결과를 바꾸지 않는다', async () => {
    const names = async (q: string) => (await find('GPU', q)).items.map((i) => i.name);
    expect(await names('rtx4070')).toEqual(await names('rtx 4070'));
    expect(await names('rtx-4070')).toEqual(await names('rtx 4070'));
    expect(await names('RTX 4070')).toEqual(await names('rtx4070'));

    const cpu = async (q: string) => (await find('CPU', q)).items.map((i) => i.name);
    expect(await cpu('9800x3d')).toEqual(['AMD Ryzen 7 9800X3D']);
    expect(await cpu('9800 x3d')).toEqual(['AMD Ryzen 7 9800X3D']);
  });

  it('파트넘버로도 찾는다 — 붙여 넣는 사람이 있다', async () => {
    expect((await find('CPU', '100-100000084WOF')).items).toHaveLength(1);
    expect((await find('CPU', '100100000084wof')).items).toHaveLength(1);
  });

  it('브랜드가 이름에 없어도 브랜드로 찾는다', async () => {
    // 이름이 'ASUS …'로 시작하지 않는 부품도 있다. brand 컬럼이 그걸 받는다.
    const page = await find('GPU', '엔비디아');
    expect(page.items[0]?.brand).toBe('NVIDIA');
  });

  it('★ 뜻을 모르는 한글은 결과를 0건으로 만든다', async () => {
    // 조용히 버리면 "다나와 5080"이 5080 전부를 부른다.
    const page = await find('GPU', '다나와 5080');
    expect(page.unknown).toEqual(['다나와']);
    expect(page.items).toHaveLength(0);
  });

  it('★ 빈 검색어는 전체를 낸다', async () => {
    expect((await find('GPU', '')).items).toHaveLength(2);
    expect((await find('GPU', '   ')).items).toHaveLength(2);
  });

  it('★ 기호만 친 검색어가 전체를 열지 않는다 — 조각이 비면 like %% 가 된다', async () => {
    // '-' 하나는 squash 뒤에 빈 문자열이다. 조건으로 넣으면 전부 통과한다.
    // 조건을 만들지 않는 쪽이 맞다: 검색어가 없는 것과 같다.
    expect((await find('GPU', '---')).items).toHaveLength(2);
    // 뜻 있는 조각과 섞이면 그 조각만 남는다.
    expect((await find('GPU', '--- 5080')).items).toHaveLength(1);
  });

  it('★ 몇 개 중 몇 개인지 말한다 — 목록이 전부인 척하지 않는다', async () => {
    const page = await searchCandidates(db, {
      category: 'GPU',
      query: '',
      constraints: [],
      limit: 1,
    });
    expect(page.items).toHaveLength(1);
    // 1개만 보여주더라도 맞는 것이 2개라는 사실은 말해야 한다.
    expect(page.matched).toBe(2);
  });

  it('matched는 제약을 거친 뒤의 수다 — hidden과 겹쳐 세지 않는다', async () => {
    const all = await searchCandidates(db, { category: 'GPU', query: '', constraints: [] });
    expect(all.matched).toBe(2);
    expect(all.hidden).toBe(0);
  });

  it('카테고리 밖으로 새지 않는다', async () => {
    expect((await find('CPU', '지포스')).items).toHaveLength(0);
  });

  it('작은따옴표를 쳐도 쿼리가 깨지지 않는다', async () => {
    const page = await find('GPU', "geforce' or '1'='1");
    expect(page.items).toHaveLength(0);
  });
});
