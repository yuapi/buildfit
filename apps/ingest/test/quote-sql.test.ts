/**
 * 견적서 매칭 SQL — ADR-0018.
 *
 * **가장 중요한 성질은 "하나로 확정했으면 그게 맞다"**이다. 여럿이면 고르게
 * 하고 못 찾으면 못 찾았다고 하면 되지만, 하나를 잘못 확정하면 사용자는
 * 확인 없이 틀린 부품을 견적에 넣는다.
 *
 * DB가 필요하다. `DATABASE_URL`이 없으면 건너뛴다 — CI에는 항상 있다.
 */

import { createDb } from '@buildfit/db';
import { matchQuote } from '@buildfit/db/quote';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createScratchDb, type Scratch } from './helpers/scratch-db';

const describeIfDb = process.env['DATABASE_URL'] ? describe : describe.skip;

if (process.env['CI'] === 'true' && !process.env['DATABASE_URL']) {
  throw new Error('CI인데 DATABASE_URL이 없다. 견적서 매칭 검증이 조용히 빠진다.');
}

describeIfDb('견적서 매칭 SQL (ADR-0018)', () => {
  let scratch: Scratch;
  let db: ReturnType<typeof createDb>['db'];
  let close: () => Promise<void>;

  beforeAll(async () => {
    scratch = await createScratchDb();
    const made = createDb(scratch.url, { max: 2 });
    db = made.db;
    close = () => made.client.end();

    await db.execute(sql`
      insert into parts (slug, category, brand, model_name, release_year) values
        ('q-cpu1', 'CPU', 'AMD', 'AMD Ryzen 7 9800X3D', 2024),
        ('q-cpu2', 'CPU', 'AMD', 'AMD Ryzen 9 9950X3D', 2025),
        ('q-mb',   'Motherboard', 'ASUS', 'ASUS PRIME B650M-A II', 2023),
        ('q-mb2',  'Motherboard', 'ASUS', 'ASUS PRIME B650M-A AX II', 2023),
        ('q-gpu1', 'GPU', 'GIGABYTE', 'GIGABYTE GeForce RTX™ 4070 Ti SUPER EAGLE OC 16G', 2024),
        ('q-gpu2', 'GPU', 'GIGABYTE', 'GIGABYTE GeForce RTX 4070 EVO OC Edition 12G', 2024),
        ('q-case', 'PCCase', 'Lian Li', 'Lian Li O11 Dynamic EVO ATX Mid Tower White', 2022),
        ('q-cool', 'CPUCooler', 'Noctua', 'Noctua NH-D15 chromax.black', 2021),
        ('q-chip', 'GPUChip', 'NVIDIA', 'GeForce RTX 4070 Ti SUPER', 2024)
    `);
  }, 60_000);

  afterAll(async () => {
    await close?.();
    await scratch?.drop();
  });

  const run = (text: string) => matchQuote(db, text);
  const names = (r: { candidates: readonly { name: string }[] }) => r.candidates.map((c) => c.name);

  it('★ 이름표를 찾는 말로 쓰지 않는다', async () => {
    // 「CPU」를 조각으로 쓰면 이름에 cpu가 든 부품만 찾게 되어 줄이 통째로 빗나간다.
    const [row] = await run('CPU: AMD 라이젠7-5세대 9800X3D (그래니트릿지) (멀티팩)');
    expect(names(row!)).toEqual(['AMD Ryzen 7 9800X3D']);
  });

  it('이름표가 카테고리를 좁힌다', async () => {
    // 이름표가 없으면 GPU 칩 레코드까지 걸린다 — 있으면 그 카테고리만 본다.
    const [labelled] = await run('그래픽카드: GIGABYTE RTX 4070 Ti SUPER 에어로 OC 16G');
    expect(labelled!.category).toBe('GPU');
    expect(names(labelled!)).toEqual([
      'GIGABYTE GeForce RTX™ 4070 Ti SUPER EAGLE OC 16G',
    ]);
  });

  it('★ GPUChip은 견적에 들어갈 수 없으므로 후보가 되지 않는다', async () => {
    const [row] = await run('GeForce RTX 4070 Ti SUPER');
    expect(row!.candidates.every((c) => c.category !== 'GPUChip')).toBe(true);
  });

  it('★ Ti를 앞에 붙여 Edition을 걸러낸다', async () => {
    // 붙이지 않으면 `ti`가 `Edition` 안에도 있어 4070 Ti에 4070 EVO OC Edition이 섞인다.
    const [row] = await run('그래픽카드: GIGABYTE RTX 4070 Ti SUPER');
    expect(names(row!)).not.toContain('GIGABYTE GeForce RTX 4070 EVO OC Edition 12G');
  });

  it('여럿이면 여럿을 준다 — 우리가 고르지 않는다', async () => {
    const [row] = await run('메인보드: ASUS PRIME B650M-A II 대원씨티에스');
    expect(row!.candidates.length).toBeGreaterThan(1);
    expect(names(row!)).toContain('ASUS PRIME B650M-A II');
  });

  it('★ 다루지 않는 부품은 찾지 않고 그렇다고 말한다', async () => {
    const [row] = await run('SSD: 삼성 990 PRO 2TB');
    expect(row!.unsupported).toBe('스토리지');
    // 찾으면 엉뚱한 것이 걸린다. 아예 찾지 않는다.
    expect(row!.candidates).toHaveLength(0);
  });

  it('★ 부품 줄이 아니면 찾지 않는다', async () => {
    const rows = await run('합계 2,480,000원\n수량 1개\n[견적서]');
    for (const r of rows) {
      expect(r.isPart).toBe(false);
      expect(r.candidates).toHaveLength(0);
    }
  });

  it('빈 줄은 결과에 들어가지 않는다', async () => {
    expect(await run('\n\n   \n')).toHaveLength(0);
    expect(await run('')).toHaveLength(0);
  });

  it('줄 수에 상한이 있다', async () => {
    const rows = await run(Array.from({ length: 80 }, (_, i) => `줄 ${i} AMD Ryzen`).join('\n'));
    expect(rows).toHaveLength(40);
  });

  it('작은따옴표를 붙여넣어도 쿼리가 깨지지 않는다', async () => {
    const [row] = await run("CPU: ryzen' or '1'='1");
    expect(row!.candidates).toHaveLength(0);
  });

  it('못 찾으면 무엇으로 찾았는지 남긴다 — 왜 0건인지 말할 수 있어야 한다', async () => {
    const [row] = await run('메모리: 삼성 DDR5-5600 16GB');
    expect(row!.isPart).toBe(true);
    expect(row!.candidates).toHaveLength(0);
    expect(row!.terms).toContain('samsung');
  });
});
