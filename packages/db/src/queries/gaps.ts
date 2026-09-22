/**
 * 빈 필드 조회 — `pc-builder-spec.md` §5.3의 3번("빈 필드 확인").
 *
 * 무엇이 필수인지는 `@buildfit/compat`의 요구사항 선언 하나만 본다.
 * 여기서 따로 목록을 들고 있지 않는다.
 */

import { SPEC_REQUIREMENTS, rulesBlockedBy, type FieldRequirement } from '@buildfit/compat';
import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../client';
import { partSpecs, parts } from '../schema';

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
  const [totalRows, haveRows] = await db.transaction(
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
      ]),
    // 두 쿼리가 같은 시점을 보게 한다. 기본 격리 수준은 문장마다 스냅샷이 바뀐다.
    { isolationLevel: 'repeatable read' },
  );

  const totals = new Map(totalRows.map((r) => [r.category, r.n]));
  const have = new Map(haveRows.map((r) => [`${r.category}\u0000${r.key}`, r.n]));

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

/** 특정 필드가 비어 있는 부품의 조건. 목록과 집계가 같은 것을 세야 한다. */
function missingWhere(category: string, specKey: string): SQL {
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

  const have = new Set(specs.map((s) => s.key));
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
      select g.canon, s.key, s.value, min(s.unit) as unit,
             jsonb_agg(g.id order by g.id) as part_ids
      from grp g join ${partSpecs} s on s.part_id = g.id
      group by g.canon, s.key, s.value
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
