/**
 * 부품 상세 페이지용 조회 — `pc-builder-spec.md` §8, §5.5.
 */

import { and, eq, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Database } from '../client';
import { partBenchmarks, partSpecs, parts, specReports } from '../schema';
import { canonicalOnly, nameWhere, searchTerms } from './search';

/** 중복 레코드가 가리키는 대표. 자기 참조라 별칭이 필요하다 */
const canonical = alias(parts, 'canonical_part');

export interface PartSpecRow {
  readonly key: string;
  readonly value: unknown;
  readonly unit: string | null;
  readonly sourceUrl: string | null;
  readonly verifiedAt: Date | null;
  readonly disputed: boolean;
}

export interface PartDetail {
  readonly id: string;
  readonly slug: string;
  readonly category: string;
  readonly brand: string | null;
  readonly modelName: string;
  readonly releaseYear: number | null;
  readonly discontinued: boolean;
  /** 제조사 스펙 페이지. 없는 부품이 더 많다 (PSU 2.7% ~ CPU 83.1%) */
  readonly manufacturerUrl: string | null;
  readonly opendbId: string | null;
  readonly mpn: string | null;
  /**
   * 이 레코드가 중복이면 대표의 slug. 대표이거나 중복이 아니면 `null`.
   *
   * 지우지 않고 가리키는 이유는 `parts.id`가 공유 URL에 들어 있어서다 (ADR-0012).
   * 주소는 살려 두고 `rel=canonical`로 대표를 지목한다.
   */
  readonly canonicalSlug: string | null;
  readonly specs: readonly PartSpecRow[];
}

export async function partBySlug(db: Database, slug: string): Promise<PartDetail | null> {
  const [part] = await db
    .select({
      id: parts.id,
      slug: parts.slug,
      category: parts.category,
      brand: parts.brand,
      modelName: parts.modelName,
      releaseYear: parts.releaseYear,
      discontinued: parts.discontinued,
      manufacturerUrl: parts.manufacturerUrl,
      opendbId: parts.opendbId,
      mpn: parts.mpn,
      canonicalSlug: canonical.slug,
    })
    .from(parts)
    // 셀렉트 목록 안의 상관 서브쿼리는 쓰지 않는다. drizzle이 그 자리의 컬럼을
    // 테이블 없이 적어서(`"duplicate_of"`) 서브쿼리 별칭에 걸리고 항상 null이 된다.
    .leftJoin(canonical, eq(canonical.id, parts.duplicateOf))
    .where(eq(parts.slug, slug));
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
    .where(eq(partSpecs.partId, part.id))
    .orderBy(partSpecs.key);

  return { ...part, specs };
}

export interface RelatedPart {
  readonly slug: string;
  readonly category: string;
  readonly modelName: string;
  readonly brand: string | null;
}

/**
 * 같은 스펙 값을 가진 다른 카테고리 부품. 호환 목록의 근거가 된다 (§8).
 *
 * **호환성 판정이 아니다.** 규칙 엔진이 하는 일과 구분한다 — 여기서는 "소켓이 같은
 * 메인보드" 같은 단순 대조만 하고, 실제 판정은 견적 도구에서 한다. 목록에 있다고
 * 조합이 성립한다는 뜻이 아니다.
 */
export async function partsMatchingSpec(
  db: Database,
  input: {
    category: string;
    specKey: string;
    value: unknown;
    excludePartId?: string;
    limit?: number;
  },
): Promise<RelatedPart[]> {
  return partsMatchingSpecs(db, {
    category: input.category,
    match: [{ key: input.specKey, value: input.value }],
    excludePartId: input.excludePartId,
    limit: input.limit,
  });
}

/** 스펙 여러 개가 **모두** 같은 부품. 비교 후보가 쓴다 (이슈 #54) */
export async function partsMatchingSpecs(
  db: Database,
  input: {
    category: string;
    match: readonly { key: string; value: unknown }[];
    excludePartId?: string | undefined;
    limit?: number | undefined;
  },
): Promise<RelatedPart[]> {
  return db
    .select({
      slug: parts.slug,
      category: parts.category,
      modelName: parts.modelName,
      brand: parts.brand,
    })
    .from(parts)
    .where(
      and(
        eq(parts.category, input.category),
        canonicalOnly(),
        ...input.match.map(
          (m) => sql`exists (
            select 1 from ${partSpecs}
            where ${partSpecs.partId} = ${parts.id}
              and ${partSpecs.key} = ${m.key}
              and ${partSpecs.value} = ${JSON.stringify(m.value)}::jsonb)`,
        ),
        input.excludePartId ? ne(parts.id, input.excludePartId) : undefined,
      ),
    )
    .orderBy(sql`${parts.releaseYear} desc nulls last`, parts.modelName)
    .limit(input.limit ?? 12);
}

/**
 * 스펙 오류 신고 — §5.5.
 *
 * > 사용자 제보가 가장 값싼 검증 수단이다.
 *
 * 신고가 들어오면 해당 필드에 `disputed`를 세운다. 결과 화면이 "검증 중"으로
 * 표시하고, 어드민이 보강 대상으로 집는다.
 */
export async function createSpecReport(
  db: Database,
  input: {
    partId: string;
    specKey: string;
    reportedValue?: string | null;
    note?: string | null;
    clientToken: string;
  },
): Promise<void> {
  await db
    .insert(specReports)
    .values({
      partId: input.partId,
      specKey: input.specKey,
      reportedValue: input.reportedValue ?? null,
      note: input.note ?? null,
      clientToken: input.clientToken,
    })
    // 같은 브라우저가 같은 필드를 여러 번 신고해도 한 건으로 둔다 (§6.6.5).
    .onConflictDoNothing();

  await db
    .update(partSpecs)
    .set({ disputed: true })
    .where(and(eq(partSpecs.partId, input.partId), eq(partSpecs.key, input.specKey)));
}

export interface OpenReport {
  readonly id: string;
  readonly partId: string;
  readonly partName: string;
  readonly partSlug: string;
  readonly category: string;
  readonly specKey: string;
  readonly reportedValue: string | null;
  readonly note: string | null;
  readonly createdAt: Date;
}

/** 어드민의 신고 큐. 사용자가 마주친 결측이 곧 보강 우선순위다. */
export async function openSpecReports(db: Database, limit = 50): Promise<OpenReport[]> {
  return db
    .select({
      id: specReports.id,
      partId: specReports.partId,
      partName: parts.modelName,
      partSlug: parts.slug,
      category: parts.category,
      specKey: specReports.specKey,
      reportedValue: specReports.reportedValue,
      note: specReports.note,
      createdAt: specReports.createdAt,
    })
    .from(specReports)
    .innerJoin(parts, eq(parts.id, specReports.partId))
    .where(eq(specReports.status, 'open'))
    .orderBy(sql`${specReports.createdAt} desc`)
    .limit(limit);
}

// --- 목록·색인 ---------------------------------------------------------------

export interface CategoryCount {
  readonly category: string;
  readonly total: number;
}

/**
 * 카테고리별 부품 수. 목록 진입점(`/part`)에 쓴다.
 *
 * **목록과 같은 조건(`canonicalOnly`)으로 센다** (이슈 #79). 전에는 중복 레코드까지 세어
 * 색인이 「CPU 789개」인데 눌러 들어가면 「718개」였다.
 */
export async function categoryCounts(db: Database): Promise<CategoryCount[]> {
  const rows = await db
    .select({ category: parts.category, total: sql<number>`count(*)::int` })
    .from(parts)
    .where(canonicalOnly())
    .groupBy(parts.category)
    .orderBy(sql`count(*) desc`);
  return rows;
}

export interface PartListItem {
  readonly slug: string;
  readonly modelName: string;
  readonly brand: string | null;
  readonly releaseYear: number | null;
  readonly discontinued: boolean;
}

export interface PartListPage {
  readonly items: readonly PartListItem[];
  readonly total: number;
  /** 한글을 무엇으로 바꿔 찾았는지 (ADR-0017) */
  readonly translated: readonly { readonly from: string; readonly to: string }[];
  /** 뜻을 모르는 한글 조각. 있으면 결과는 0건이다 */
  readonly unknown: readonly string[];
}

/** 카테고리 목록 한 페이지. */
export async function partsInCategory(
  db: Database,
  category: string,
  opts: { limit?: number; offset?: number; query?: string } = {},
): Promise<PartListPage> {
  // 고르기와 같은 해석을 쓴다 (ADR-0017). 두 벌이 되면 "고를 땐 나오는데
  // 목록엔 없다"가 된다.
  const parsed = searchTerms(opts.query ?? '');
  const where = and(eq(parts.category, category), canonicalOnly(), ...nameWhere(parsed));

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(parts)
    .where(where);

  const items = await db
    .select({
      slug: parts.slug,
      modelName: parts.modelName,
      brand: parts.brand,
      releaseYear: parts.releaseYear,
      discontinued: parts.discontinued,
    })
    .from(parts)
    .where(where)
    .orderBy(sql`${parts.releaseYear} desc nulls last`, parts.modelName)
    .limit(opts.limit ?? 60)
    .offset(opts.offset ?? 0);

  return {
    items,
    total: countRow?.total ?? 0,
    translated: parsed.translated,
    unknown: parsed.unknown,
  };
}

/** sitemap용 slug 목록. 본문 없이 주소만 필요하다. */
export async function slugsInCategory(
  db: Database,
  category: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<{ slug: string; updatedAt: Date }[]> {
  return db
    .select({ slug: parts.slug, updatedAt: parts.updatedAt })
    .from(parts)
    // sitemap도 대표만 넣는다. 지금은 중복 1,036개 페이지가 서로 경쟁한다
    .where(and(eq(parts.category, category), canonicalOnly()))
    .orderBy(parts.slug)
    .limit(opts.limit ?? 5000)
    .offset(opts.offset ?? 0);
}

// --- 비교 ---------------------------------------------------------------------

/**
 * 비교 후보를 고르는 기준 스펙.
 *
 * §8이 "의미 있는 조합만 생성한다"고 한 것에 대한 구현이다. 아무 두 부품이나
 * 비교 페이지를 만들면 저품질 페이지 양산이 된다. 같은 축을 공유하는 것끼리만 묶는다.
 */
export const COMPARABLE_BY: Readonly<Record<string, readonly string[]>> = {
  GPU: ['chipset'], // 같은 칩의 AIB 모델끼리. 길이·클럭 차이가 커서 비교 가치가 높다
  CPU: ['socket'],
  Motherboard: ['socket'],
  // 규격만 보면 16GB 키트에 96GB 키트가 섞인다. 대신할 수 있는 것끼리 (이슈 #54)
  RAM: ['ram_type', 'capacity_gb'],
  // 폼팩터만 보면 750W에 1600W가 섞인다 (이슈 #54)
  PSU: ['form_factor', 'wattage_w'],
  PCCase: ['form_factor'],
  CPUCooler: ['water_cooled'],
  // 1TB M.2 PCIe 4.0 SSD끼리. 스토리지만 빠져 부품 페이지에 후보가 없었다 (이슈 #56)
  Storage: ['storage_type', 'form_factor', 'interface', 'capacity_gb'],
};

/** 이 부품과 비교할 만한 다른 부품들. */
export async function comparableParts(
  db: Database,
  part: { id: string; category: string; specs: readonly { key: string; value: unknown }[] },
  limit = 6,
): Promise<RelatedPart[]> {
  const keys = COMPARABLE_BY[part.category];
  if (!keys) return [];
  const match = keys.map((key) => ({ key, value: part.specs.find((s) => s.key === key)?.value }));
  // 축 하나라도 모르면 무엇과 대신할 수 있는지 모른다
  if (match.some((m) => m.value === undefined || m.value === null)) return [];

  return partsMatchingSpecs(db, {
    category: part.category,
    match,
    excludePartId: part.id,
    limit,
  });
}

/** 부품 하나의 성능 측정값 — ADR-0023. 용도 축마다 한 줄이다 */
export interface PartBenchmark {
  readonly axis: string;
  readonly value: number;
  readonly unit: string;
  readonly runs: number;
  readonly deviceName: string;
  readonly backend: string;
  readonly measuredVersion: string;
  readonly perChip: boolean;
  readonly sourceUrl: string;
  readonly snapshotDate: string;
}

export async function benchmarksForPart(db: Database, partId: string): Promise<PartBenchmark[]> {
  const rows = await db
    .select({
      axis: partBenchmarks.axis,
      value: partBenchmarks.value,
      unit: partBenchmarks.unit,
      runs: partBenchmarks.runs,
      deviceName: partBenchmarks.deviceName,
      backend: partBenchmarks.backend,
      measuredVersion: partBenchmarks.measuredVersion,
      perChip: partBenchmarks.perChip,
      sourceUrl: partBenchmarks.sourceUrl,
      snapshotDate: partBenchmarks.snapshotDate,
    })
    .from(partBenchmarks)
    .where(eq(partBenchmarks.partId, partId));
  // numeric은 문자열로 온다
  return rows.map((r) => ({ ...r, value: Number(r.value) }));
}

