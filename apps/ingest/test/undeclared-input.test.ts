/**
 * 규칙이 **선언되지 않은 입력을 읽고 있지 않은지** 본다 — 이슈 #15.
 *
 * `/rules`는 "각 검사가 쓰는 데이터가 얼마나 비어 있는지"를 공개한다. 그 표는
 * `SPEC_REQUIREMENTS`로 만든다. 규칙이 선언에 없는 값을 읽으면 **표가 결측을
 * 축소해서 보여준다** — 실제로 규칙 12가 그랬다. 화면은 0.7%라고 적는데 판정
 * 불가는 85.7%였다. 출시 연도가 선언에 없었다.
 *
 * ## 어떻게 잡는가
 *
 * **선언된 필드만 채운 견적**을 만든다. 나머지는 전부 비어 있다. 그러면:
 *
 * - 규칙이 선언한 것만 읽는다면 → 결측 때문에 판정 불가가 될 수 없다
 * - 선언에 없는 값을 읽는다면 → 그 값이 비어 있으니 **결측으로 판정 불가가 된다**
 *
 * 그래서 「결측 때문인 판정 불가」는 그 규칙의 선언된 필드들이 실제로 비어 있는
 * 정도로만 설명되어야 한다. 이 픽스처에서는 `storedOnPart` 필드(출시 연도)만
 * 일부러 비워 두므로, 그 규칙 말고는 결측 판정 불가가 나오면 안 된다.
 *
 * **실제 카탈로그를 쓰지 않는다.** 처음엔 무작위 표본으로 쟀는데 CI의 빈 DB에서
 * 표본이 0이 되어 헛돌았다 (실제로 한 번 깨졌다). 데이터에 기대지 않는 쪽이
 * 이 불변식에 맞다 — 무엇이 얼마나 비어 있는지가 아니라 **규칙이 무엇을 읽는지**를
 * 보는 검사다.
 *
 * `inconsistent`·`out-of-range`는 세지 않는다. 값이 **있는데** 이상한 경우라
 * 결측과 무관하다.
 *
 * ## 불리언을 두 값으로 다 돌린다
 *
 * 규칙에는 **불리언으로 갈리는 가지**가 있다. 규칙 9는 수랭이면 높이를 보지 않고
 * "라디에이터 장착 위치를 모른다"로 판정 불가를 낸다 — 규칙 10이 아직 없어서고
 * (이슈 #4), 그건 의도된 동작이다.
 *
 * 그래서 픽스처를 **불리언 참/거짓 두 벌**로 돌리고, 규칙마다 **둘 중 하나에서라도**
 * 결측 판정 불가를 벗어나면 통과로 본다. 픽스처 값을 골라 문제를 피하는 것보다
 * 이쪽이 정직하다 — 판정 가능한 가지가 하나도 없는 규칙만 걸린다.
 */

import { SPEC_REQUIREMENTS, evaluate, type FieldRequirement } from '@buildfit/compat';
import { createDb } from '@buildfit/db';
import { loadBuild } from '@buildfit/db/build';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createScratchDb, type Scratch } from './helpers/scratch-db';

const describeIfDb = process.env['DATABASE_URL'] ? describe : describe.skip;

if (process.env['CI'] === 'true' && !process.env['DATABASE_URL']) {
  throw new Error('CI인데 DATABASE_URL이 없다. 선언 누락 검증이 조용히 빠진다.');
}

const SLOTS = {
  CPU: 'cpu',
  Motherboard: 'motherboard',
  RAM: 'ram',
  GPU: 'gpu',
  PCCase: 'pcCase',
  PSU: 'psu',
  CPUCooler: 'cooler',
  Storage: 'storage',
} as const;

/**
 * 선언된 모양에 맞는 **아무 값**. 판정이 맞는지는 보지 않는다 —
 * 값이 **있다**는 것만 필요하다.
 */
function fixtureValue(req: FieldRequirement, boolValue: boolean): unknown {
  if (req.valueType === 'boolean') return boolValue;
  if (req.valueType === 'number') return 4;
  if (req.valueType === 'string[]') return [req.options?.[0] ?? 'X'];
  return req.options?.[0] ?? 'X';
}

const PART_IDS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(SLOTS).map((c, i) => [c, `dddddddd-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`]),
);

describeIfDb('규칙이 선언되지 않은 입력을 읽지 않는다 (이슈 #15)', () => {
  let scratch: Scratch;
  let db: ReturnType<typeof createDb>['db'];
  let close: () => Promise<void>;
  /** 돈 규칙 전부 */
  const ranRules = new Set<number>();
  /** 두 벌 모두에서 결측 판정 불가인 규칙 → 비어 있다고 말한 필드 */
  const alwaysMissing = new Map<number, string[]>();

  beforeAll(async () => {
    scratch = await createScratchDb();
    const made = createDb(scratch.url, { max: 2 });
    db = made.db;
    close = () => made.client.end();

    for (const [category, id] of Object.entries(PART_IDS)) {
      await db.execute(sql`
        insert into parts (id, slug, category, model_name)
        values (${id}, ${`decl-${category.toLowerCase()}`}, ${category}, ${`${category} 표본`})`);
    }

    const judged = new Set<number>();
    for (const boolValue of [true, false]) {
      // 선언된 필수 필드를 전부 채운다. **그 밖의 것은 아무것도 채우지 않는다.**
      for (const req of SPEC_REQUIREMENTS) {
        if (req.optional === true) continue;
        // parts 컬럼에 있는 입력은 일부러 비워 둔다 — 그 규칙만 결측 판정 불가가
        // 되어야 하고, 그것이 이 검사의 대조군이다.
        if (req.storedOnPart === true) continue;
        const id = PART_IDS[req.category];
        if (!id) continue;
        await db.execute(sql`
          insert into part_specs (part_id, key, value)
          values (${id}, ${req.specKey}, ${JSON.stringify(fixtureValue(req, boolValue))}::jsonb)
          on conflict (part_id, key) do update set value = excluded.value`);
      }

      const build = await loadBuild(db, {
        cpu: PART_IDS['CPU'],
        motherboard: PART_IDS['Motherboard'],
        ram: [PART_IDS['RAM']!],
        gpu: PART_IDS['GPU'],
        pcCase: PART_IDS['PCCase'],
        psu: PART_IDS['PSU'],
        cooler: PART_IDS['CPUCooler'],
        storage: [PART_IDS['Storage']!],
      });

      for (const r of evaluate(build).results) {
        ranRules.add(r.ruleId);
        if (r.verdict === 'unknown' && r.reason?.kind === 'missing') {
          alwaysMissing.set(
            r.ruleId,
            r.reason.fields.map((f) => f.field),
          );
        } else {
          // 이 가지에서는 결측을 벗어났다. 규칙 9의 공랭 가지가 그렇다.
          judged.add(r.ruleId);
        }
      }
    }
    for (const id of judged) alwaysMissing.delete(id);
  }, 60_000);

  afterAll(async () => {
    await close();
    await scratch.drop();
  });

  it('픽스처가 실제로 규칙을 돌렸다', () => {
    const build = evaluate({
      cpu: null,
      motherboard: null,
      ram: [],
      gpu: null,
      pcCase: null,
      psu: null,
      cooler: null,
      storage: [],
    });
    // 빈 견적에서는 규칙이 하나도 돌지 않는다. 위 beforeAll이 아무것도 안 했는데
    // 통과하는 일이 없어야 한다.
    expect(build.results).toHaveLength(0);
    expect(Object.keys(SLOTS)).toHaveLength(8);
    // 픽스처가 규칙을 실제로 태웠다. 0개를 훑으며 통과하는 일이 없어야 한다
    expect(ranRules.size, '픽스처에서 규칙이 하나도 돌지 않았다').toBeGreaterThanOrEqual(14);
  });

  it('★ 선언된 필드를 다 채우면 결측으로 판정 불가가 되지 않는다', () => {
    // 예외: `storedOnPart` 필드는 이 픽스처가 일부러 비워 둔다.
    const expected = new Set(
      SPEC_REQUIREMENTS.filter((r) => r.storedOnPart === true && r.optional !== true).map(
        (r) => r.ruleId,
      ),
    );
    for (const [ruleId, fields] of alwaysMissing) {
      expect(
        expected.has(ruleId),
        `규칙 ${ruleId}이 선언된 필드를 다 채웠는데도 (불리언 참·거짓 양쪽에서) ` +
          `결측으로 판정 불가다 ` +
          `(빈 것: ${fields.join(', ')}). 규칙이 SPEC_REQUIREMENTS에 없는 입력을 읽고 있다 — ` +
          `그러면 /rules가 그 결측을 보여주지 못하고 어드민도 채울 수 없다.`,
      ).toBe(true);
    }
  });

  it('대조군 — 비워 둔 컬럼 필드는 실제로 결측으로 잡힌다', () => {
    // 이 테스트가 「아무 규칙도 결측이 아니다」를 무조건 통과하는 일이 없어야 한다.
    const withColumn = SPEC_REQUIREMENTS.filter(
      (r) => r.storedOnPart === true && r.optional !== true,
    );
    expect(withColumn.length, '컬럼 백업 필드가 없으면 이 대조군이 헛돈다').toBeGreaterThan(0);
    for (const r of withColumn) {
      expect(
        alwaysMissing.has(r.ruleId),
        `${r.category}.${r.specKey}를 비웠는데 규칙 ${r.ruleId}이 결측으로 잡히지 않았다`,
      ).toBe(true);
    }
  });
});
