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
import { searchAcrossCategories } from '@buildfit/db/search';
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

  /*
   * ★ 두 정의가 갈릴 수 있는 **유일한 두 글자**다.
   *
   * 전 유니코드를 양쪽에서 대조하면, JS `toLowerCase()` 뒤에 `[^a-z0-9]`
   * 필터를 통과하는 비ASCII는 `İ`(U+0130)와 켈빈 기호 `K`(U+212A)뿐이다.
   * 나머지(`Ǆ`, `ẞ`, 전각 등)는 양쪽 모두 필터에서 사라져 차이가 남지 않는다.
   *
   * 이 둘은 **DB 로케일에 달렸다.** 보통의 UTF-8·ICU 로케일에서는 PG도
   * `i`·`k`로 낮추지만, 클러스터가 `C`/`POSIX`로 초기화되면 그대로 남아
   * 필터에 지워진다 — 그러면 검색이 조용히 빗나간다.
   *
   * 그래서 여기서 고정한다. CI의 DB가 그런 로케일로 서면 이 테스트가 깨진다.
   */
  'Intel İnside K Edition',
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
        -- 같은 낱말이 여러 카테고리에 걸리는지 보려면 브랜드가 겹쳐야 한다
        ('p-mb',   'Motherboard', 'ASUS', 'ASUS ROG STRIX B650E-F GAMING WIFI', 'ROG-B650EF'),
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

  describe('카테고리를 가로질러 찾기', () => {
    const CATS = ['CPU', 'Motherboard', 'RAM', 'GPU', 'PCCase', 'PSU', 'CPUCooler'];
    const across = (query: string, perCategory?: number) =>
      searchAcrossCategories(db, {
        query,
        categories: CATS,
        ...(perCategory === undefined ? {} : { perCategory }),
      });

    it('★ 한 낱말이 여러 카테고리에 걸린다', async () => {
      // 카테고리를 먼저 고르게 하면 이런 것을 찾을 수 없다.
      const r = await across('asus');
      const cats = r.groups.map((g) => g.category).sort();
      expect(cats).toContain('Motherboard');
      expect(cats).toContain('GPU');
    });

    it('많이 걸린 카테고리가 먼저다', async () => {
      const r = await across('geforce');
      const totals = r.groups.map((g) => g.total);
      expect([...totals].sort((a, b) => b - a)).toEqual(totals);
    });

    it('★ 카테고리마다 앞에서 몇 개씩만 준다', async () => {
      const r = await across('geforce', 1);
      for (const g of r.groups) expect(g.items.length).toBeLessThanOrEqual(1);
      // 그래도 전체 건수는 말한다 — "1개뿐"으로 읽히면 안 된다.
      const gpu = r.groups.find((g) => g.category === 'GPU');
      expect(gpu?.total).toBeGreaterThan(1);
    });

    it('★ 검색어가 없으면 아무것도 끌어오지 않는다', async () => {
      // 전체를 끌어오는 것은 목록 페이지가 할 일이다.
      expect((await across('')).groups).toEqual([]);
      expect((await across('   ')).groups).toEqual([]);
    });

    it('★ 뜻을 모르는 한글은 0건이고, 그렇다고 말한다', async () => {
      const r = await across('다나와 5080');
      expect(r.unknown).toEqual(['다나와']);
      expect(r.groups).toEqual([]);
    });

    it('한글을 무엇으로 바꿔 찾았는지 돌려준다', async () => {
      expect((await across('지포스')).translated).toEqual([{ from: '지포스', to: 'geforce' }]);
    });

    it('카테고리 목록이 비면 찾지 않는다', async () => {
      expect(
        (await searchAcrossCategories(db, { query: 'geforce', categories: [] })).groups,
      ).toEqual([]);
    });

    it('★ GPUChip처럼 뺀 카테고리는 결과에 없다', async () => {
      // 어느 카테고리를 볼지는 **호출부**가 정한다. DB 계층이 정책을 갖지 않는다.
      const r = await across('geforce');
      expect(r.groups.every((g) => CATS.includes(g.category))).toBe(true);
    });

    it('작은따옴표를 쳐도 쿼리가 깨지지 않는다', async () => {
      expect((await across("asus' or '1'='1")).groups).toEqual([]);
    });
  });
});
