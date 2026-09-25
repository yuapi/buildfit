/**
 * 빈 필드 조회 — `pc-builder-spec.md` §5.3의 3번("빈 필드 확인").
 *
 * 무엇이 필수인지는 `@buildfit/compat`의 요구사항 선언 하나만 본다.
 * 여기서 따로 목록을 들고 있지 않는다.
 */

import {
  SPEC_REQUIREMENTS,
  rulesBlockedBy,
  socketCanonicalPairs,
  type FieldRequirement,
} from '@buildfit/compat';
import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../client';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { partSpecs, parts } from '../schema';

/**
 * `storedOnPart` 필드의 `specKey` → `parts` 컬럼 (이슈 #15).
 *
 * 규칙 엔진은 값이 어디 저장되는지 모른다. 그 대응을 아는 곳은 DB 계층뿐이므로
 * 여기 한 군데에 둔다. **선언에 새 `storedOnPart` 필드가 생기면 여기도 와야
 * 하고, 빠뜨리면 그 필드가 조용히 100% 결측으로 잡힌다** —
 * `apps/ingest/test/mapping-coverage.test.ts`가 그 누락을 잡는다.
 */
const PART_FIELDS = {
  release_year: 'releaseYear',
} as const satisfies Record<string, keyof typeof parts.$inferSelect>;

export const PART_COLUMNS: Readonly<Record<string, AnyPgColumn>> = Object.fromEntries(
  Object.entries(PART_FIELDS).map(([key, field]) => [key, parts[field]]),
);

/**
 * `parts` 컬럼에 있는 필수 입력 중 **채워진 것**의 specKey (이슈 #48).
 *
 * `part_specs`만 보고 채워졌는지 판단하면 연도가 있는 부품도 「출시 연도가 비어 있다」가 된다.
 * 공개 부품 페이지가 그랬다. 위 표 하나에서 나오므로 `PART_COLUMNS`와 어긋나지 않는다.
 */
export function filledPartColumnKeys(part: {
  readonly [K in (typeof PART_FIELDS)[keyof typeof PART_FIELDS]]: unknown;
}): string[] {
  return Object.entries(PART_FIELDS)
    .filter(([, field]) => part[field] !== null && part[field] !== undefined)
    .map(([key]) => key);
}

export interface FieldGap {
  readonly category: string;
  readonly specKey: string;
  readonly label: string;
  /** 이 필드가 없어서 막히는 규칙 번호 */
  readonly blocksRules: readonly number[];
  readonly totalParts: number;
  readonly missingParts: number;
  readonly missingPct: number;
}

/**
 * 카테고리 × 필수 필드별 결측 현황.
 *
 * 어드민 첫 화면이자 공개 「검사 규칙」 페이지의 근거다.
 *
 * **쿼리 두 번으로 끝낸다.** 필드마다 하나씩 돌리면 25번이고 294ms다 (실측).
 * 공개 페이지가 요청마다 그것을 돌 수는 없다. 대신 "이 키를 가진 부품 수"를
 * 한 번에 세고 전체에서 뺀다 — 값이 비어 있어도 행이 있으면 있는 것으로
 * 세는 것은 전과 같다 (판정 쪽에서 결측을 따로 다룬다).
 */
export async function fieldGapSummary(db: Database): Promise<FieldGap[]> {
  const required = SPEC_REQUIREMENTS.filter((r) => r.optional !== true);
  const keys = [...new Set(required.map((r) => r.specKey))];
  if (keys.length === 0) return [];

  /**
   * 두 수를 **한 스냅샷에서** 읽는다.
   *
   * 따로 읽으면 적재가 도는 중 그 사이에 부품과 스펙이 커밋될 수 있고,
   * 그러면 `have > total`이 되어 결측이 0으로 눌린다 — 표가 "다 채워졌다"고
   * 거짓말한다. 이 수는 공개 페이지(`/rules`)가 그대로 보여주는 값이다.
   */
  const [totalRows, haveRows, columnRows] = await db.transaction(
    async (tx) =>
      await Promise.all([
        tx
          .select({ category: parts.category, n: sql<number>`count(*)::int` })
          .from(parts)
          .groupBy(parts.category),
        tx
          .select({
            category: parts.category,
            key: partSpecs.key,
            // 복합 PK(part_id, key)라 한 부품에 같은 키가 두 번 오지 않는다.
            n: sql<number>`count(*)::int`,
          })
          .from(partSpecs)
          .innerJoin(parts, eq(parts.id, partSpecs.partId))
          .where(inArray(partSpecs.key, keys))
          .groupBy(parts.category, partSpecs.key),
        // `parts` 컬럼에 있는 입력 (이슈 #15). 컬럼마다 "값이 있는 부품 수"를
        // 한 쿼리에서 같이 센다.
        tx
          .select({
            category: parts.category,
            ...Object.fromEntries(
              Object.entries(PART_COLUMNS).map(([key, col]) => [
                key,
                sql<number>`count(${col})::int`,
              ]),
            ),
          })
          .from(parts)
          .groupBy(parts.category),
      ]),
    // 두 쿼리가 같은 시점을 보게 한다. 기본 격리 수준은 문장마다 스냅샷이 바뀐다.
    { isolationLevel: 'repeatable read' },
  );

  const totals = new Map(totalRows.map((r) => [r.category, r.n]));
  const have = new Map(haveRows.map((r) => [`${r.category}\u0000${r.key}`, r.n]));
  for (const r of columnRows as unknown as Record<string, unknown>[]) {
    for (const key of Object.keys(PART_COLUMNS)) {
      have.set(`${String(r['category'])}\u0000${key}`, Number(r[key] ?? 0));
    }
  }

  const out: FieldGap[] = [];
  for (const req of required) {
    const total = totals.get(req.category) ?? 0;
    // 아직 적재하지 않은 카테고리다. 0을 100% 결측으로 내면 표가 거짓말을 한다.
    if (total === 0) continue;
    // 한 스냅샷에서 읽었으므로 음수가 될 수 없다. 그래도 눌러두는 이유는
    // 조인이 언젠가 중복 계수하게 되면 **음수가 그 증상**이기 때문이다 —
    // 눌러서 감추지 않고 드러나게 두려면 여기가 아니라 테스트가 잡아야 한다.
    const missing = Math.max(0, total - (have.get(`${req.category}\u0000${req.specKey}`) ?? 0));
    out.push({
      category: req.category,
      specKey: req.specKey,
      label: req.label,
      blocksRules: rulesBlockedBy(req.category, req.specKey),
      totalParts: total,
      missingParts: missing,
      missingPct: Math.round((1000 * missing) / total) / 10,
    });
  }

  // 결측이 많은 순. 채웠을 때 효과가 큰 것부터 보여준다.
  return out.sort((a, b) => b.missingParts - a.missingParts);
}

export interface GapPart {
  readonly id: string;
  readonly slug: string;
  readonly category: string;
  readonly brand: string | null;
  readonly modelName: string;
  readonly releaseYear: number | null;
  /** 제조사 스펙 페이지. 보강 작업자가 출처를 찾는 단계를 없앤다 */
  readonly manufacturerUrl: string | null;
}

/** 이 필드가 비어 있는 부품이 몇 건이고, 그중 출처를 바로 열 수 있는 것이 몇 건인가. */
export interface GapCounts {
  readonly missing: number;
  /** 제조사 스펙 주소가 있는 것. **지금 바로 채울 수 있는 건수다** */
  readonly withSource: number;
}

/**
 * 특정 필드가 비어 있는 부품의 조건. 목록과 집계가 같은 것을 세야 한다.
 *
 * `parts` 컬럼에 있는 입력(이슈 #15)은 `part_specs`를 보지 않는다 — 행이 없는
 * 것이 아니라 컬럼이 `null`인 것이다.
 */
function missingWhere(category: string, specKey: string): SQL {
  const column = PART_COLUMNS[specKey];
  if (column) return sql`${eq(parts.category, category)} and ${column} is null`;
  return sql`${eq(parts.category, category)} and not exists (
    select 1 from ${partSpecs} s
    where s.part_id = ${parts.id} and s.key = ${specKey}
  )`;
}

/**
 * 특정 필드가 비어 있는 부품 목록.
 *
 * **제조사 스펙 주소가 있는 것을 먼저 준다** (이슈 #3).
 *
 * 전에는 출시연도 내림차순이었는데, 가장 큰 결측인 케이스
 * `supported_psu_form_factors`에서는 그 순서가 뜻이 없다 — 값이 빈 3,185건 중
 * **3,155건이 출시연도를 모른다.** 사실상 이름순이었고, 화면은 "최신 부품부터"라고
 * 적고 있었다.
 *
 * 보강에서 가장 오래 걸리는 단계는 출처를 찾는 것이다. 주소가 있는 278건은
 * 바로 채울 수 있고(케이스 전체의 8.7%), 없는 2,907건은 작업자가 직접 찾아야
 * 한다. 그 278건이 이름순으로 흩어져 있으면 아무도 닿지 못한다.
 *
 * **중복 레코드를 빼지 않는다.** 대표가 아닌 레코드도 공유 링크가 담을 수 있고
 * (ADR-0012) 규칙은 id로 판정한다 — 채우면 그 링크의 판정 불가가 줄어든다.
 * 케이스에서는 15건뿐이라 순서에 영향도 없다.
 */
export async function partsMissingField(
  db: Database,
  category: string,
  specKey: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<GapPart[]> {
  return db
    .select({
      id: parts.id,
      slug: parts.slug,
      category: parts.category,
      brand: parts.brand,
      modelName: parts.modelName,
      releaseYear: parts.releaseYear,
      manufacturerUrl: parts.manufacturerUrl,
    })
    .from(parts)
    .where(missingWhere(category, specKey))
    // 1) 출처를 열 수 있는 것 먼저 (PG에서 false < true)
    // 2) 그다음 최신 부품부터 — 연도를 아는 카테고리에서는 이게 유효하다
    .orderBy(
      sql`${parts.manufacturerUrl} is null`,
      sql`${parts.releaseYear} desc nulls last`,
      parts.modelName,
    )
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
}

/** 위 목록의 전체 건수와, 그중 바로 채울 수 있는 건수. */
export async function gapCounts(
  db: Database,
  category: string,
  specKey: string,
): Promise<GapCounts> {
  const [row] = await db
    .select({
      missing: sql<number>`count(*)::int`,
      withSource: sql<number>`count(${parts.manufacturerUrl})::int`,
    })
    .from(parts)
    .where(missingWhere(category, specKey));
  return { missing: row?.missing ?? 0, withSource: row?.withSource ?? 0 };
}

export interface PartWithSpecs extends GapPart {
  readonly specs: readonly {
    readonly key: string;
    readonly value: unknown;
    readonly unit: string | null;
    readonly sourceUrl: string | null;
    readonly verifiedAt: Date | null;
    readonly disputed: boolean;
  }[];
  /** 이 부품에서 아직 비어 있는 필수 필드 */
  readonly missing: readonly FieldRequirement[];
}

export async function partWithSpecs(db: Database, id: string): Promise<PartWithSpecs | null> {
  const [part] = await db
    .select({
      id: parts.id,
      slug: parts.slug,
      category: parts.category,
      brand: parts.brand,
      modelName: parts.modelName,
      releaseYear: parts.releaseYear,
      manufacturerUrl: parts.manufacturerUrl,
    })
    .from(parts)
    .where(eq(parts.id, id));
  if (!part) return null;

  const specs = await db
    .select({
      key: partSpecs.key,
      value: partSpecs.value,
      unit: partSpecs.unit,
      sourceUrl: partSpecs.sourceUrl,
      verifiedAt: partSpecs.verifiedAt,
      disputed: partSpecs.disputed,
    })
    .from(partSpecs)
    .where(eq(partSpecs.partId, id))
    .orderBy(partSpecs.key);

  // `parts` 컬럼에 있는 입력도 센다 (이슈 #15). 여기서 빠뜨리면 보강 화면이
  // "비어 있음" 표시를 안 붙이고, 작업자가 채울 대상으로 보지 않는다.
  const have = new Set([...specs.map((s) => s.key), ...filledPartColumnKeys(part)]);
  const missing = SPEC_REQUIREMENTS.filter(
    (r) => r.category === part.category && r.optional !== true && !have.has(r.specKey),
  );

  return { ...part, specs, missing };
}

/**
 * 스펙 값 저장 — §5.3의 7번.
 *
 * **`sourceUrl`을 요구한다.** 출처 없이 저장하지 않는다 (§5.5: 나중에 재검증할 때
 * 출처가 없으면 처음부터 다시 해야 한다). 사람이 확인해 넣은 값이므로
 * `verifiedAt`을 함께 찍는다.
 */
export async function saveSpec(
  db: Database,
  input: {
    partId: string;
    key: string;
    value: unknown;
    unit?: string | null;
    sourceUrl: string;
  },
): Promise<void> {
  if (!input.sourceUrl.trim()) {
    throw new Error('출처 URL 없이 저장할 수 없습니다 (§5.5).');
  }

  /**
   * ★ 부품의 카테고리와 필드의 카테고리가 맞는지 본다.
   *
   * 없을 때 확인해 보니 **CPU에 `supported_psu_form_factors`가 그대로 들어갔다.**
   * 어드민만 부를 수 있는 경로지만, 화면 버그 하나로도 조용히 그렇게 된다.
   * 그러면 결측 집계가 그 CPU를 "케이스 필드를 가진 것"으로 세고, 표가 거짓말을
   * 하기 시작한다.
   *
   * **마지막 문 앞에서 본다.** 화면 쪽(`saveSpecCore`)에도 검사가 있지만,
   * 이 함수는 테스트와 스크립트가 직접 부른다.
   */
  const [part] = await db
    .select({ category: parts.category })
    .from(parts)
    .where(eq(parts.id, input.partId));
  if (!part) throw new Error('없는 부품입니다.');

  const known = SPEC_REQUIREMENTS.filter((r) => r.specKey === input.key);
  if (known.length > 0 && !known.some((r) => r.category === part.category)) {
    throw new Error(
      `${part.category}에는 ${input.key} 필드를 저장할 수 없습니다 ` +
        `(${[...new Set(known.map((r) => r.category))].join(', ')} 전용).`,
    );
  }

  // `parts` 컬럼에 있는 입력 (이슈 #15). 출처를 함께 남길 자리가 없다 —
  // `parts`에는 컬럼별 source_url이 없다. **그래서 흔적을 `part_specs`에도
  // 남긴다**: 컬럼이 판정에 쓰이는 값이고, 그 행이 출처와 확인 시각을 든다.
  // 적재는 컬럼을 덮어쓰지만 그 행은 사람이 넣은 것이라 지우지 않는다
  // (「낡은 스펙 정리」가 OpenDB 출처만 지운다).
  if (PART_COLUMNS[input.key]) {
    if (input.key !== 'release_year') {
      throw new Error(`컬럼 ${input.key}의 저장 방법이 정의되지 않았습니다.`);
    }
    const year = Number(input.value);
    if (!Number.isInteger(year)) throw new Error('출시 연도는 정수여야 합니다.');
    // 선언된 범위 밖은 여기서 막는다. 막지 않으면 int4를 넘겨 **DB가 던지고**,
    // 서버 동작이 그 원시 오류를 그대로 올린다.
    const bounds = SPEC_REQUIREMENTS.find(
      (r) => r.specKey === input.key && r.category === part.category,
    );
    if (bounds?.min !== undefined && year < bounds.min) {
      throw new Error(`출시 연도는 ${bounds.min} 이상이어야 합니다.`);
    }
    if (bounds?.max !== undefined && year > bounds.max) {
      throw new Error(`출시 연도는 ${bounds.max} 이하여야 합니다.`);
    }
    await db.transaction(async (tx) => {
      await tx
        .update(parts)
        .set({ releaseYear: year, updatedAt: sql`now()` })
        .where(eq(parts.id, input.partId));
      await tx
        .insert(partSpecs)
        .values({
          partId: input.partId,
          key: input.key,
          value: year as never,
          unit: null,
          sourceUrl: input.sourceUrl,
          verifiedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [partSpecs.partId, partSpecs.key],
          set: {
            value: sql`excluded.value`,
            sourceUrl: sql`excluded.source_url`,
            verifiedAt: sql`excluded.verified_at`,
            disputed: sql`false`,
            updatedAt: sql`now()`,
          },
        });
    });
    return;
  }

  await db
    .insert(partSpecs)
    .values({
      partId: input.partId,
      key: input.key,
      value: input.value as never,
      unit: input.unit ?? null,
      sourceUrl: input.sourceUrl,
      verifiedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [partSpecs.partId, partSpecs.key],
      set: {
        value: sql`excluded.value`,
        unit: sql`excluded.unit`,
        sourceUrl: sql`excluded.source_url`,
        verifiedAt: sql`excluded.verified_at`,
        // 사람이 확인해 다시 넣었으므로 신고 플래그를 내린다 (§5.5)
        disputed: sql`false`,
        updatedAt: sql`now()`,
      },
    });
}

// --- 값이 어긋나는 스펙 -------------------------------------------------------

/**
 * 「값이 같은가」를 볼 때 쓰는 비교용 값 — 이슈 #16 뒷정리.
 *
 * 같은 소켓을 다르게 적은 표기(`TR4`/`sTR4`)는 **같은 값으로 센다.** 그러지 않으면
 * 중복 레코드 간 불일치 검사가 Threadripper 2950X 쌍둥이를 「값이 어긋난다」로
 * 잡아 「검증 중」을 세우고, 규칙 1이 「검증 중인 값으로 판정했습니다」라고 말한다.
 * 같은 소켓인데.
 *
 * 등가 표는 `@buildfit/compat`의 것을 그대로 받아 온다. **SQL에 따로 적지 않는다** —
 * 두 벌이면 한쪽만 고치는 날 판정과 검증 표시가 갈라진다.
 *
 * **이 식을 쓰는 곳은 둘이고 둘이 같아야 한다**: 적재의 `flagConflictingSpecs`와
 * 어드민의 `conflictingSpecs`. 테스트가 둘의 일치를 본다.
 *
 * `alias`는 `part_specs`에 붙인 별칭이다 (`s`).
 */
export function comparableSpecValue(alias: string): SQL {
  const t = sql.raw(alias);
  const pairs = socketCanonicalPairs();
  if (pairs.length === 0) return sql`${t}.value::text`;
  const rows = sql.join(
    pairs.map(([name, canon]) => sql`(${name}, ${canon})`),
    sql`, `,
  );
  return sql`coalesce(
    (select to_jsonb(a.canon)::text
       from (values ${rows}) as a(name, canon)
      where ${t}.key = 'socket' and a.name = ${t}.value #>> '{}'),
    ${t}.value::text
  )`;
}


export interface ConflictingValue {
  readonly value: unknown;
  readonly unit: string | null;
  /** 이 값을 들고 있는 레코드들 */
  readonly partIds: readonly string[];
}

export interface SpecConflict {
  readonly category: string;
  /**
   * 어긋난 스펙 키.
   *
   * 표시 이름은 여기서 붙이지 않는다 — 필수 필드 선언(`SPEC_REQUIREMENTS`)에 없는
   * 키도 어긋날 수 있고, 그때 선언에서 이름을 찾으면 키가 그대로 나온다.
   * 화면이 자기 표시 이름표를 쓴다.
   */
  readonly specKey: string;
  /** 대표 레코드. 이름은 그룹 전체가 같다 (그게 같은 제품으로 묶은 근거다) */
  readonly canonicalId: string;
  readonly modelName: string;
  readonly brand: string | null;
  /** 이 필드를 입력으로 쓰는 규칙 번호 */
  readonly affectsRules: readonly number[];
  readonly values: readonly ConflictingValue[];
}

/**
 * 같은 제품 안에서 **값이 어긋나는** 스펙 — 이슈 #12.
 *
 * 같은 제품이면 스펙도 같아야 한다. 어긋나면 하나는 틀렸다. **정답을 몰라도
 * 얻는 신호다** — 이 프로젝트에서 검증 근거를 구하기가 가장 어려운데(외부 도메인이
 * 막혀 있다) 이것은 데이터 안에서 나온다.
 *
 * 빈 필드 목록(수만 건)보다 훨씬 작고 훨씬 정확한 작업 목록이다. 127쌍 · 85그룹이고
 * 규칙 8의 입력 세 개가 포함된다.
 *
 * **어느 쪽이 맞는지 고르지 않는다.** 다수결도 최신순도 근거가 아니다 — 어긋난
 * 값을 나란히 보여주고 사람이 출처를 보고 채운다 (§5.5).
 *
 * 그룹은 `coalesce(duplicate_of, id)`다. 적재가 이미 계산해 둔 답을 쓴다 —
 * 이름·제조사·연도로 여기서 다시 묶으면 기준이 두 벌이 되고 조용히 어긋난다.
 */
export async function conflictingSpecs(db: Database, limit = 100): Promise<SpecConflict[]> {
  const rows = await db.execute<{
    canonical_id: string;
    key: string;
    category: string;
    model_name: string;
    brand: string | null;
    values: { value: unknown; unit: string | null; partIds: string[] }[];
  }>(sql`
    with canon as (
      select distinct duplicate_of as id from ${parts} where duplicate_of is not null
    ), grp as (
      -- ★ 중복 그룹에 든 레코드만 본다 (2.03%, 1,036건).
      --
      -- 전체를 훑으면 26,485건의 스펙 전부를 그룹핑해 950ms가 나온다. 어드민이
      -- 요청마다 도는 화면이다. 중복이 없는 부품은 **어긋날 수가 없다** —
      -- part_specs의 PK가 (part_id, key)라 키 하나에 값이 하나다. 그래서
      -- 좁혀도 결과가 같다.
      select p.id, coalesce(p.duplicate_of, p.id) as canon
      from ${parts} p
      where p.duplicate_of is not null or exists (select 1 from canon c where c.id = p.id)
    ), vals as (
      -- 같은 값을 여럿이 들고 있으면 한 줄로 묶는다. "true 2건 vs false 1건"이
      -- 보여야 사람이 판단할 수 있다.
      --
      -- 단위는 min()으로 딸려 보낸다. 묶는 기준에 넣으면 단위만 다른 경우가
      -- 어긋난 값으로 세어져 적재의 disputed와 수가 달라진다.
      select g.canon, s.key,
             -- 같은 값으로 센 표기가 여럿이면 하나를 대표로 보여준다
             min(s.value::text)::jsonb as value,
             min(s.unit) as unit,
             jsonb_agg(g.id order by g.id) as part_ids
      from grp g join ${partSpecs} s on s.part_id = g.id
      group by g.canon, s.key, ${comparableSpecValue('s')}
    ), conflicting as (
      select canon, key, count(*)::int as n,
             jsonb_agg(
               jsonb_build_object('value', value, 'unit', unit, 'partIds', part_ids)
               order by value::text
             ) as values
      from vals group by canon, key having count(*) > 1
    )
    select
      c.canon::text as canonical_id,
      c.key,
      p.category,
      p.model_name,
      p.brand,
      c.values
    from conflicting c
    join ${parts} p on p.id = c.canon
    -- 어긋난 값이 많은 것부터. 셋으로 갈린 것이 둘로 갈린 것보다 나쁘다
    order by c.n desc, p.category, c.key, p.model_name
    limit ${limit}
  `);

  return rows.map((r) => ({
    category: r.category,
    specKey: r.key,
    canonicalId: r.canonical_id,
    modelName: r.model_name,
    brand: r.brand,
    affectsRules: rulesBlockedBy(r.category, r.key),
    values: r.values ?? [],
  }));
}

/** 「검증 중」인 값의 규모. 공개 「검사 규칙」 페이지가 그대로 보여준다. */
export interface DisputedSummary {
  /** `disputed`가 선 (부품, 키) 행 수 */
  readonly rows: number;
  /** 그중 하나라도 걸린 부품 수 */
  readonly parts: number;
}

/**
 * 「검증 중」인 값이 얼마나 되는가 — ADR-0021.
 *
 * `/rules`가 "무엇을 검사할 수 없는지"를 공개하는 페이지이므로, **결측만
 * 적으면 절반만 말하는 것이다.** 판정의 세 번째 상태(값은 있으나 다투어진다)도
 * 규모와 함께 밝힌다.
 *
 * 다른 숫자들과 같이 **요청마다 실제로 센다.** 문서에 적어두면 늘 낡는다.
 */
export async function disputedSummary(db: Database): Promise<DisputedSummary> {
  const [row] = await db
    .select({
      rows: sql<number>`count(*)::int`,
      parts: sql<number>`count(distinct ${partSpecs.partId})::int`,
    })
    .from(partSpecs)
    .where(eq(partSpecs.disputed, true));
  return { rows: row?.rows ?? 0, parts: row?.parts ?? 0 };
}

/**
 * 출시 연도가 소켓보다 앞서는 레코드의 기준 — 이슈 #18.
 *
 * 세 값은 실측으로 정했다. 걸리는 앞쪽 무리는 소켓 전체의 0.6~1.6%이고, 가장
 * 가까운 정상 사례(LGA 1151의 2015년, Skylake)가 15.2%다. **경계를 1.6% 초과
 * 15.2% 이하 어디에 그어도 결과가 같다.** 여유가 넓지 않으므로 업스트림이
 * 바뀌면 다시 잰다. 근거: `docs/research/release-year-plausibility.md`
 */
export const YEAR_PLAUSIBILITY = {
  /** 그 연도 다음으로 나오는 연도까지의 간격. 2 = 빈 해가 하나 이상 */
  minGapYears: 2,
  /** 그 연도 **이하**가 소켓 전체에서 차지하는 비율의 상한 */
  maxLeadShare: 0.05,
  /**
   * 소켓에 연도가 있는 대표 레코드가 이만큼은 있어야 분포를 믿는다.
   * 5%에서는 따로 작동하지 않는다(20건 미만이면 1건도 5% 이상). 비율을 올릴 때의 안전장치
   */
  minDatedOnSocket: 20,
} as const;

/**
 * 소켓 표기를 등가 묶음의 대표로 접는다. `TR4`/`sTR4`가 한 분포가 되어야 한다.
 * 등가 표는 `@buildfit/compat`의 것을 받는다 — `comparableSpecValue`와 같은 이유.
 */
function canonicalSocket(alias: string): SQL {
  const t = sql.raw(alias);
  const pairs = socketCanonicalPairs();
  if (pairs.length === 0) return sql`${t}.value #>> '{}'`;
  const rows = sql.join(
    pairs.map(([name, canon]) => sql`(${name}, ${canon})`),
    sql`, `,
  );
  return sql`coalesce(
    (select a.canon from (values ${rows}) as a(name, canon) where a.name = ${t}.value #>> '{}'),
    ${t}.value #>> '{}'
  )`;
}

/**
 * 출시 연도가 **소켓보다 먼저**인 레코드를 고르는 SELECT — 이슈 #18.
 *
 * 같은 소켓의 부품은 그 소켓보다 먼저 나올 수 없다. 그런데 소켓이 언제 나왔는지는
 * 모른다(제조사 도메인이 막혀 있다). 그래서 **데이터 안의 분포**로 본다 — 앞쪽에
 * 빈 해를 사이에 두고 홀로 떨어진 무리는 틀린 값이다. AM5에 2020년 레코드 3건이
 * 있고 2021년은 0건, 2022년부터 몰려 있다. Ryzen 5 7500F가 그 3건 중 하나다.
 *
 * 소켓마다 연도가 있는 CPU·보드 **대표** 레코드로 분포를 만들고, 조건을 만족하는
 * 가장 늦은 연도까지 그 앞을 전부 고른다. 가장 늦은 것까지 고르는 이유: 2019·2020이
 * 붙어 있고 2022부터 몰려 있으면 2020만 조건(다음 연도까지 2년)을 만족하는데,
 * 2019가 더 이르다.
 *
 * **고르는 것은 중복 레코드까지다.** 예전 공유 링크가 중복 id를 담고 있을 수 있다.
 * **사람이 출처와 함께 넣은 연도는 고르지 않는다** — 분포에는 센다.
 *
 * 쓰는 곳은 둘이고 같은 식이어야 한다: 적재의 `flagImplausibleYears`와 어드민 목록.
 */
export function implausibleYearSelect(): SQL {
  const { minGapYears, maxLeadShare, minDatedOnSocket } = YEAR_PLAUSIBILITY;
  return sql`
    with dated as (
      select p.id, p.category, p.model_name, p.brand, p.duplicate_of,
             p.release_year as year, ${canonicalSocket('s')} as socket
      from ${parts} p
      join ${partSpecs} s on s.part_id = p.id and s.key = 'socket'
      where p.category in ('CPU', 'Motherboard') and p.release_year is not null
    ), yrs as (
      select socket, year, count(*) as n
      from dated where duplicate_of is null
      group by socket, year
    ), stat as (
      select socket, year,
             lead(year) over w as next_year,
             sum(n) over w as lead_n,
             sum(n) over (partition by socket) as total
      from yrs
      window w as (partition by socket order by year)
    ), cutoff as (
      select distinct on (socket) socket, year, next_year, lead_n, total
      from stat
      where next_year - year >= ${minGapYears}
        and total >= ${minDatedOnSocket}
        and lead_n < total * ${maxLeadShare}::numeric
      order by socket, year desc
    )
    select d.id as part_id, d.category, d.model_name, d.brand, d.year, d.socket,
           c.next_year, c.lead_n::int as lead_count, c.total::int as socket_count
    from dated d
    join cutoff c on c.socket = d.socket and d.year <= c.year
    where not exists (
      select 1 from ${partSpecs} h
      where h.part_id = d.id and h.key = 'release_year'
        and h.source_url not like 'https://github.com/buildcores/%'
    )
  `;
}

export interface ImplausibleYear {
  readonly partId: string;
  readonly category: string;
  readonly modelName: string;
  readonly brand: string | null;
  readonly year: number;
  readonly socket: string;
  /** 같은 소켓에서 이 무리 다음으로 나오는 연도 */
  readonly nextYear: number;
  /** 이 무리(연도가 기준 이하인 대표 레코드) 수 */
  readonly leadCount: number;
  /** 소켓에 연도가 있는 대표 레코드 수 */
  readonly socketCount: number;
}

/**
 * 어드민이 볼 목록 — 이슈 #18. **정답 연도는 적지 않는다.** 모르기 때문이다.
 * 다음 연도는 「적어도 이보다 이르지는 않을 것」이 아니라 분포의 모양을 보이는 값이다.
 */
export async function implausibleReleaseYears(db: Database): Promise<ImplausibleYear[]> {
  const rows = await db.execute<{
    part_id: string;
    category: string;
    model_name: string;
    brand: string | null;
    year: number;
    socket: string;
    next_year: number;
    lead_count: number;
    socket_count: number;
  }>(sql`
    select part_id::text, category, model_name, brand, year, socket, next_year,
           lead_count, socket_count
    from (${implausibleYearSelect()}) x
    order by socket, year, model_name
  `);
  return rows.map((r) => ({
    partId: r.part_id,
    category: r.category,
    modelName: r.model_name,
    brand: r.brand,
    year: r.year,
    socket: r.socket,
    nextYear: r.next_year,
    leadCount: r.lead_count,
    socketCount: r.socket_count,
  }));
}

/**
 * 메모리 키트의 세 값. **모듈 수 × 모듈 용량 = 총 용량**이다 (이슈 #20).
 */
export const RAM_LAYOUT_KEYS = ['module_count', 'module_capacity_gb', 'capacity_gb'] as const;

/**
 * 스스로 모순인 메모리 레코드를 고르는 SELECT — 이슈 #20.
 *
 * 세 값의 산술이 맞지 않거나, 이름의 `(2x16GB)`가 모듈 수·모듈 용량과 다르면 어딘가
 * 틀렸다. **경계값이 없다** — 맞거나 안 맞거나다. 어느 값이 틀렸는지는 고르지 않는다.
 *
 * 이름은 `(NxMGB)` 꼴만 읽는다. `(24x2)`처럼 단위가 없으면 순서를 알 수 없어서
 * 읽지 않는다 (KINGBANK가 용량을 앞에 쓴다). 그때는 산술만 본다.
 *
 * 세 값이 모두 사람이 확인한 것이면 고르지 않는다 — 이름은 고칠 수 없으니, 사람이
 * 이름과 다른 값을 출처와 함께 넣었다면 이름이 틀린 것이다.
 */
export function inconsistentRamSelect(): SQL {
  const keys = sql.join(
    RAM_LAYOUT_KEYS.map((k) => sql`${k}`),
    sql`, `,
  );
  const num = (key: string) =>
    sql`max(case when s.key = ${key} and jsonb_typeof(s.value) = 'number' then (s.value #>> '{}')::numeric end)`;
  return sql`
    with r as (
      select p.id, p.model_name, p.brand,
             ${num('module_count')} as module_count,
             ${num('module_capacity_gb')} as module_capacity_gb,
             ${num('capacity_gb')} as capacity_gb,
             bool_and(s.source_url is not null and s.source_url not like 'https://github.com/buildcores/%') as all_human,
             substring(lower(p.model_name) from '\\((\\d+)\\s*x\\s*\\d+(?:\\.\\d+)?\\s*gb\\)')::numeric as name_count,
             substring(lower(p.model_name) from '\\(\\d+\\s*x\\s*(\\d+(?:\\.\\d+)?)\\s*gb\\)')::numeric as name_module_gb
      from ${parts} p
      join ${partSpecs} s on s.part_id = p.id and s.key in (${keys})
      where p.category = 'RAM'
      group by p.id, p.model_name, p.brand
    )
    select id as part_id, model_name, brand, module_count, module_capacity_gb, capacity_gb,
           name_count, name_module_gb
    from r
    where not all_human and (
      module_count * module_capacity_gb <> capacity_gb
      or name_count <> module_count
      or name_module_gb <> module_capacity_gb
    )
  `;
}

export interface InconsistentRam {
  readonly partId: string;
  readonly modelName: string;
  readonly brand: string | null;
  readonly moduleCount: number | null;
  readonly moduleCapacityGb: number | null;
  readonly capacityGb: number | null;
  /** 이름의 `(NxMGB)`에서 읽은 값. 이름에 없으면 null */
  readonly nameCount: number | null;
  readonly nameModuleGb: number | null;
}

/** 어드민이 볼 목록 — 이슈 #20. 이름과 세 값을 나란히 보인다. */
export async function inconsistentRamKits(db: Database): Promise<InconsistentRam[]> {
  const rows = await db.execute<{
    part_id: string;
    model_name: string;
    brand: string | null;
    module_count: string | null;
    module_capacity_gb: string | null;
    capacity_gb: string | null;
    name_count: string | null;
    name_module_gb: string | null;
  }>(sql`
    select part_id::text, model_name, brand, module_count, module_capacity_gb, capacity_gb,
           name_count, name_module_gb
    from (${inconsistentRamSelect()}) x
    order by model_name
  `);
  // numeric은 문자열로 온다
  const n = (v: string | null) => (v === null ? null : Number(v));
  return rows.map((r) => ({
    partId: r.part_id,
    modelName: r.model_name,
    brand: r.brand,
    moduleCount: n(r.module_count),
    moduleCapacityGb: n(r.module_capacity_gb),
    capacityGb: n(r.capacity_gb),
    nameCount: n(r.name_count),
    nameModuleGb: n(r.name_module_gb),
  }));
}

/**
 * 적재의 자기 검사가 `disputed`를 세우는 (부품, 키) 전부 — #18 · #20.
 *
 * 중복 불일치 검사의 거두기가 이것을 뺀다. 검사가 늘면 **여기 하나에 더한다** —
 * 거두기 쪽에 따로 적으면 하나를 빠뜨리는 날 순서에 따라 표시가 사라진다.
 */
export function selfCheckFlagsSelect(): SQL {
  const ramKeys = sql.join(
    RAM_LAYOUT_KEYS.map((k) => sql`(${k}::text)`),
    sql`, `,
  );
  return sql`
    select y.part_id, 'release_year'::text as key from (${implausibleYearSelect()}) y
    union all
    select x.part_id, k.key from (${inconsistentRamSelect()}) x
    cross join (values ${ramKeys}) as k(key)
  `;
}
