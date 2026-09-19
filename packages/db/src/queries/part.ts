/**
 * 부품 상세 페이지용 조회 — `pc-builder-spec.md` §8, §5.5.
 */

import { and, eq, ne, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { partSpecs, parts, specReports } from '../schema';

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
  readonly opendbId: string | null;
  readonly mpn: string | null;
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
      opendbId: parts.opendbId,
      mpn: parts.mpn,
    })
    .from(parts)
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
  return db
    .select({
      slug: parts.slug,
      category: parts.category,
      modelName: parts.modelName,
      brand: parts.brand,
    })
    .from(parts)
    .innerJoin(partSpecs, eq(partSpecs.partId, parts.id))
    .where(
      and(
        eq(parts.category, input.category),
        eq(partSpecs.key, input.specKey),
        sql`${partSpecs.value} = ${JSON.stringify(input.value)}::jsonb`,
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

/** 카테고리별 부품 수. 목록 진입점과 sitemap 분할에 쓴다. */
export async function categoryCounts(db: Database): Promise<CategoryCount[]> {
  const rows = await db
    .select({ category: parts.category, total: sql<number>`count(*)::int` })
    .from(parts)
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
}

/** 카테고리 목록 한 페이지. */
export async function partsInCategory(
  db: Database,
  category: string,
  opts: { limit?: number; offset?: number; query?: string } = {},
): Promise<PartListPage> {
  const q = (opts.query ?? '').trim();
  const where =
    q === ''
      ? eq(parts.category, category)
      : and(eq(parts.category, category), sql`${parts.modelName} ilike ${'%' + q + '%'}`);

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

  return { items, total: countRow?.total ?? 0 };
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
    .where(eq(parts.category, category))
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
const COMPARABLE_BY: Readonly<Record<string, string>> = {
  GPU: 'chipset', // 같은 칩의 AIB 모델끼리. 길이·클럭 차이가 커서 비교 가치가 높다
  CPU: 'socket',
  Motherboard: 'socket',
  RAM: 'ram_type',
  PSU: 'form_factor',
  PCCase: 'form_factor',
  CPUCooler: 'water_cooled',
};

/** 이 부품과 비교할 만한 다른 부품들. */
export async function comparableParts(
  db: Database,
  part: { id: string; category: string; specs: readonly { key: string; value: unknown }[] },
  limit = 6,
): Promise<RelatedPart[]> {
  const key = COMPARABLE_BY[part.category];
  if (!key) return [];
  const value = part.specs.find((s) => s.key === key)?.value;
  if (value === undefined || value === null) return [];

  return partsMatchingSpec(db, {
    category: part.category,
    specKey: key,
    value,
    excludePartId: part.id,
    limit,
  });
}
