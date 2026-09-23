/**
 * 중복 레코드 묶기 — 이슈 #11.
 *
 * 지켜야 할 성질은 둘이고 서로 반대 방향이다.
 *
 * 1. **목록·검색·sitemap에는 대표만 나온다.** 같은 제품이 7번 나오면 고를 수 없다
 * 2. **중복 레코드도 id·slug로는 여전히 열린다.** `parts.id`는 이미 뿌려진 공유
 *    URL이 담고 있다 (ADR-0012). 목록에서 빼는 것과 없애는 것은 다르다
 *
 * DB가 필요하다. `DATABASE_URL`이 없으면 건너뛴다 — CI에는 항상 있다.
 */

import { createDb } from '@buildfit/db';
import { loadBuild } from '@buildfit/db/build';
import { partBySlug, partsInCategory, slugsInCategory } from '@buildfit/db/part';
import { conflictingSpecs, saveSpec } from '@buildfit/db/queries';
import { searchCandidates } from '@buildfit/db/picker';
import { matchQuote } from '@buildfit/db/quote';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { flagConflictingSpecs, markDuplicates } from '../src/duplicates';
import { createScratchDb, type Scratch } from './helpers/scratch-db';

const describeIfDb = process.env['DATABASE_URL'] ? describe : describe.skip;

if (process.env['CI'] === 'true' && !process.env['DATABASE_URL']) {
  throw new Error('CI인데 DATABASE_URL이 없다. 중복 묶기 검증이 조용히 빠진다.');
}

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const SOLO = '44444444-4444-4444-8444-444444444444';
const OTHER_YEAR = '55555555-5555-4555-8555-555555555555';

describeIfDb('중복 레코드 묶기 (이슈 #11)', () => {
  let scratch: Scratch;
  let db: ReturnType<typeof createDb>['db'];
  let close: () => Promise<void>;

  beforeAll(async () => {
    scratch = await createScratchDb();
    const made = createDb(scratch.url, { max: 2 });
    db = made.db;
    close = () => made.client.end();

    // 같은 제품 3건. 이름의 공백·대소문자만 다르다 — 화면에서 구별할 방법이 없다.
    // opendb_id 사전순으로 B가 대표가 되어야 한다 (A의 것은 'zz'로 둔다).
    await db.execute(sql`
      insert into parts (id, slug, category, brand, model_name, release_year, opendb_id) values
        (${A}, 'ram-a', 'RAM', 'Corsair', 'Vengeance  LPX 32GB', 2023, 'zz-a'),
        (${B}, 'ram-b', 'RAM', 'Corsair', 'vengeance lpx 32gb',  2023, 'aa-b'),
        (${C}, 'ram-c', 'RAM', 'Corsair', 'Vengeance LPX 32GB',  2023, 'mm-c'),
        (${SOLO}, 'ram-solo', 'RAM', 'Corsair', 'Vengeance LPX 64GB', 2023, 'aa-solo'),
        (${OTHER_YEAR}, 'ram-2019', 'RAM', 'Corsair', 'Vengeance LPX 32GB', 2019, 'aa-old')
    `);
    // 같은 제품인데 용량이 어긋난다 → 하나는 틀린 값이다.
    // 소켓은 셋이 같으므로 건드리면 안 된다.
    await db.execute(sql`
      insert into part_specs (part_id, key, value) values
        (${A}, 'capacity_gb', '32'::jsonb),
        (${B}, 'capacity_gb', '32'::jsonb),
        (${C}, 'capacity_gb', '16'::jsonb),
        (${A}, 'memory_type', '"DDR5"'::jsonb),
        (${B}, 'memory_type', '"DDR5"'::jsonb),
        (${C}, 'memory_type', '"DDR5"'::jsonb)
    `);

    await markDuplicates(db);
    await flagConflictingSpecs(db);
  }, 60_000);

  afterAll(async () => {
    await close();
    await scratch.drop();
  });

  it('opendb_id 사전순 최솟값이 대표가 된다', async () => {
    const rows = await db.execute<{ id: string; duplicate_of: string | null }>(
      sql`select id::text, duplicate_of::text from parts order by id`,
    );
    const by = new Map(rows.map((r) => [r.id, r.duplicate_of]));
    expect(by.get(B)).toBeNull();
    expect(by.get(A)).toBe(B);
    expect(by.get(C)).toBe(B);
  });

  it('출시연도가 다르면 다른 제품으로 둔다 — 넓게 묶어 남을 삼키지 않는다', async () => {
    const [row] = await db.execute<{ duplicate_of: string | null }>(
      sql`select duplicate_of::text from parts where id = ${OTHER_YEAR}`,
    );
    expect(row?.duplicate_of).toBeNull();
  });

  it('중복이 없는 것은 그대로 대표다', async () => {
    const [row] = await db.execute<{ duplicate_of: string | null }>(
      sql`select duplicate_of::text from parts where id = ${SOLO}`,
    );
    expect(row?.duplicate_of).toBeNull();
  });

  it('두 번 돌려도 같은 대표가 나온다 — rel=canonical이 오가면 안 된다', async () => {
    const before = await markDuplicates(db);
    const after = await markDuplicates(db);
    expect(after.marked).toBe(before.marked);
    const [row] = await db.execute<{ duplicate_of: string | null }>(
      sql`select duplicate_of::text from parts where id = ${A}`,
    );
    expect(row?.duplicate_of).toBe(B);
  });

  it('업스트림이 중복을 정리하면 표시가 풀린다', async () => {
    await db.execute(sql`update parts set release_year = 2024 where id = ${C}`);
    await markDuplicates(db);
    const [row] = await db.execute<{ duplicate_of: string | null }>(
      sql`select duplicate_of::text from parts where id = ${C}`,
    );
    expect(row?.duplicate_of).toBeNull();
    // 원상복구. 뒤 테스트가 3건 그룹을 기대한다
    await db.execute(sql`update parts set release_year = 2023 where id = ${C}`);
    await markDuplicates(db);
  });

  it('값이 어긋나는 키에만 검증 표시가 선다', async () => {
    const rows = await db.execute<{ key: string; disputed: boolean }>(
      sql`select key, disputed from part_specs where part_id = ${A} order by key`,
    );
    const by = new Map(rows.map((r) => [r.key, r.disputed]));
    // 32 vs 16 — 하나는 틀렸다
    expect(by.get('capacity_gb')).toBe(true);
    // 셋이 같다. 멀쩡한 값에 「검증 중」을 붙이면 표시가 의미를 잃는다
    expect(by.get('memory_type')).toBe(false);
  });

  // --- 목록에서 빼는 쪽 ---------------------------------------------------

  it('카테고리 목록은 대표만 보여준다', async () => {
    const page = await partsInCategory(db, 'RAM', { query: 'vengeance lpx 32gb' });
    expect(page.items.map((i) => i.slug).sort()).toEqual(['ram-2019', 'ram-b']);
    // total도 같이 줄어야 한다. 숫자만 5라고 적으면 페이지가 어긋난다
    expect(page.total).toBe(2);
  });

  it('고르기 후보도 대표만 보여준다', async () => {
    const page = await searchCandidates(db, {
      category: 'RAM',
      query: 'vengeance lpx 32gb',
      constraints: [],
    });
    expect(page.items.map((i) => i.id).sort()).toEqual([B, OTHER_YEAR].sort());
  });

  it('sitemap에도 대표만 넣는다', async () => {
    const slugs = (await slugsInCategory(db, 'RAM')).map((s) => s.slug);
    expect(slugs).not.toContain('ram-a');
    expect(slugs).not.toContain('ram-c');
    expect(slugs).toContain('ram-b');
  });

  it('견적서 붙여넣기도 대표만 센다 — 중복을 세면 확정이 깨진다', async () => {
    const [line] = await matchQuote(db, '램: 커세어 Vengeance LPX 32GB');
    const ids = line?.candidates.map((c) => c.id) ?? [];
    // 연도는 `search_text`에 없다. 같은 이름의 2019년 레코드가 함께 걸리는 것이
    // 맞다 — 여기서 보는 것은 **중복 3건이 1건으로 줄었는지**다.
    expect(ids).toContain(B);
    expect(ids).not.toContain(A);
    expect(ids).not.toContain(C);
    expect(ids).toHaveLength(2);
  });

  // --- 거두기와 소켓 표기 (이슈 #16 뒷정리) -------------------------------

  describe('검증 표시 거두기', () => {
    const TW1 = 'eeeeeeee-0000-4000-8000-000000000001';
    const TW2 = 'eeeeeeee-0000-4000-8000-000000000002';
    const REP = 'eeeeeeee-0000-4000-8000-000000000003';

    beforeAll(async () => {
      // 같은 CPU 쌍둥이. 소켓을 TR4 / sTR4로 적었다 — 같은 소켓이다
      await db.execute(sql`
        insert into parts (id, slug, category, brand, model_name, release_year, opendb_id) values
          (${TW1}, 'tr-a', 'CPU', 'AMD', 'Threadripper 2950X', 2018, 'tr-a'),
          (${TW2}, 'tr-b', 'CPU', 'AMD', 'Threadripper 2950X', 2018, 'tr-b'),
          (${REP}, 'rep-solo', 'CPU', 'AMD', 'Ryzen 신고받은 것', 2022, 'rep-solo')`);
      await db.execute(sql`
        insert into part_specs (part_id, key, value) values
          (${TW1}, 'socket', '"sTR4"'::jsonb),
          (${TW2}, 'socket', '"TR4"'::jsonb),
          (${REP}, 'socket', '"AM5"'::jsonb)`);
      await markDuplicates(db);
    });

    it('★ 같은 소켓의 다른 표기는 어긋남이 아니다', async () => {
      await flagConflictingSpecs(db);
      const rows = await db.execute<{ disputed: boolean }>(
        sql`select disputed from part_specs where part_id in (${TW1}, ${TW2}) and key = 'socket'`,
      );
      expect(rows.map((r) => r.disputed)).toEqual([false, false]);
    });

    it('★ 이 검사가 세웠는데 더는 어긋나지 않으면 거둔다', async () => {
      // 이전 적재에서 어긋남으로 세워졌다고 친다 (예: 소켓 등가 표가 생기기 전)
      await db.execute(
        sql`update part_specs set disputed = true where part_id in (${TW1}, ${TW2}) and key = 'socket'`,
      );
      const r = await flagConflictingSpecs(db);
      expect(r.retracted).toBeGreaterThanOrEqual(2);
      const rows = await db.execute<{ disputed: boolean }>(
        sql`select disputed from part_specs where part_id in (${TW1}, ${TW2}) and key = 'socket'`,
      );
      expect(rows.every((x) => !x.disputed)).toBe(true);
    });

    it('★ 사람이 신고해 세운 것은 거두지 않는다 — 어긋남이 없어도', async () => {
      // 신고는 disputed와 열린 spec_report를 함께 만든다 (createSpecReport)
      await db.execute(sql`update part_specs set disputed = true where part_id = ${REP} and key = 'socket'`);
      await db.execute(sql`
        insert into spec_reports (part_id, spec_key, reported_value, client_token)
        values (${REP}, 'socket', 'AM4', 'test-token')`);
      await flagConflictingSpecs(db);
      const [row] = await db.execute<{ disputed: boolean }>(
        sql`select disputed from part_specs where part_id = ${REP} and key = 'socket'`,
      );
      expect(row?.disputed, '신고가 열려 있는데 표시가 사라졌다').toBe(true);
    });

    it('신고가 처리되면(open이 아니면) 거둘 수 있다', async () => {
      await db.execute(sql`update spec_reports set status = 'resolved' where part_id = ${REP}`);
      await flagConflictingSpecs(db);
      const [row] = await db.execute<{ disputed: boolean }>(
        sql`select disputed from part_specs where part_id = ${REP} and key = 'socket'`,
      );
      expect(row?.disputed).toBe(false);
    });

    it('진짜 어긋남은 그대로 둔다 — 거두기가 과하지 않다', async () => {
      await flagConflictingSpecs(db);
      const rows = await db.execute<{ disputed: boolean }>(
        sql`select disputed from part_specs where part_id = ${A} and key = 'capacity_gb'`,
      );
      expect(rows[0]?.disputed).toBe(true);
    });

    it('★ 사람이 출처와 함께 확인한 값은 다시 세우지 않는다 (이슈 #19)', async () => {
      // 어드민이 제조사 페이지를 보고 C의 16을 확인했다. 쌍둥이 A·B는 여전히 32다.
      // 어긋남은 남지만 **의심할 쪽은 확인되지 않은 OpenDB 값**이다
      await saveSpec(db, { partId: C, key: 'capacity_gb', value: 16, sourceUrl: 'https://example.com/c' });
      await flagConflictingSpecs(db);
      const rows = await db.execute<{ id: string; disputed: boolean }>(sql`
        select part_id::text as id, disputed from part_specs
        where part_id in (${A}, ${B}, ${C}) and key = 'capacity_gb' order by part_id`);
      expect(Object.fromEntries(rows.map((r) => [r.id, r.disputed]))).toEqual({
        [A]: true,
        [B]: true,
        [C]: false,
      });
    });

    it('사람이 확인한 행에 이전 적재가 세워 둔 표시는 거둔다', async () => {
      // 이슈 #19 이전에는 확인한 행도 다시 세웠다. 그 흔적이 남아 있다고 친다
      await db.execute(sql`update part_specs set disputed = true where part_id = ${C} and key = 'capacity_gb'`);
      await flagConflictingSpecs(db);
      const [row] = await db.execute<{ disputed: boolean }>(
        sql`select disputed from part_specs where part_id = ${C} and key = 'capacity_gb'`,
      );
      expect(row?.disputed).toBe(false);
    });
  });

  // --- 어드민 작업 목록 (이슈 #12) -----------------------------------------

  it('어긋난 값을 나란히 내놓는다', async () => {
    const rows = await conflictingSpecs(db);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.specKey).toBe('capacity_gb');
    expect(row.canonicalId).toBe(B);
    // 같은 값을 든 둘은 한 줄로 묶인다. "32가 2건, 16이 1건"이 보여야 판단이 된다
    const byValue = new Map(row.values.map((v) => [JSON.stringify(v.value), v.partIds]));
    expect([...(byValue.get('32') ?? [])].sort()).toEqual([A, B].sort());
    expect(byValue.get('16')).toEqual([C]);
  });

  it('값이 같은 키는 목록에 올리지 않는다 — 멀쩡한 것을 띄우면 목록이 의미를 잃는다', async () => {
    const rows = await conflictingSpecs(db);
    expect(rows.map((r) => r.specKey)).not.toContain('memory_type');
  });

  it('★ 어드민 목록과 적재의 disputed가 같은 것을 센다', async () => {
    // 기준이 두 벌이면 「검증 중」이 붙은 값이 목록에 없거나 그 반대가 된다.
    const rows = await conflictingSpecs(db, 10_000);
    const pairs = new Set(rows.map((r) => `${r.canonicalId}.${r.specKey}`));

    const flagged = await db.execute<{ canon: string; key: string }>(sql`
      select coalesce(p.duplicate_of, p.id)::text as canon, s.key
      from part_specs s join parts p on p.id = s.part_id
      where s.disputed
      group by 1, 2
    `);
    expect(new Set(flagged.map((f) => `${f.canon}.${f.key}`))).toEqual(pairs);
  });

  // --- 주소는 살려 두는 쪽 (ADR-0012) -------------------------------------

  it('중복 레코드도 slug로 열리고 대표를 가리킨다', async () => {
    const dup = await partBySlug(db, 'ram-a');
    expect(dup?.id).toBe(A);
    expect(dup?.canonicalSlug).toBe('ram-b');
  });

  it('대표는 아무것도 가리키지 않는다', async () => {
    const canon = await partBySlug(db, 'ram-b');
    expect(canon?.canonicalSlug).toBeNull();
  });

  it('★ 이미 뿌려진 공유 링크가 중복 레코드를 담고 있어도 열린다', async () => {
    const build = await loadBuild(db, { ram: [A] });
    expect(build.ram.map((r) => r.id)).toEqual([A]);
  });
});
