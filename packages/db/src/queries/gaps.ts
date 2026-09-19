/**
 * 빈 필드 조회 — `pc-builder-spec.md` §5.3의 3번("빈 필드 확인").
 *
 * 무엇이 필수인지는 `@buildfit/compat`의 요구사항 선언 하나만 본다.
 * 여기서 따로 목록을 들고 있지 않는다.
 */

import { PHASE0_REQUIREMENTS, rulesBlockedBy, type FieldRequirement } from '@buildfit/compat';
import { and, eq, sql } from 'drizzle-orm';
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

/** 카테고리 × 필수 필드별 결측 현황. 어드민 첫 화면. */
export async function fieldGapSummary(db: Database): Promise<FieldGap[]> {
  const required = PHASE0_REQUIREMENTS.filter((r) => r.optional !== true);

  const totals = new Map<string, number>();
  for (const row of await db
    .select({ category: parts.category, n: sql<number>`count(*)::int` })
    .from(parts)
    .groupBy(parts.category)) {
    totals.set(row.category, row.n);
  }

  const out: FieldGap[] = [];
  for (const req of required) {
    const total = totals.get(req.category) ?? 0;
    if (total === 0) continue;
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(parts)
      .where(
        and(
          eq(parts.category, req.category),
          sql`not exists (
            select 1 from ${partSpecs} s
            where s.part_id = ${parts.id} and s.key = ${req.specKey}
          )`,
        ),
      );
    const missing = row?.n ?? 0;
    out.push({
      category: req.category,
      specKey: req.specKey,
      label: req.label,
      blocksRules: rulesBlockedBy(req.category, req.specKey),
      totalParts: total,
      missingParts: missing,
      missingPct: total === 0 ? 0 : Math.round((1000 * missing) / total) / 10,
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

/** 특정 필드가 비어 있는 부품 목록. */
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
    .where(
      and(
        eq(parts.category, category),
        sql`not exists (
          select 1 from ${partSpecs} s
          where s.part_id = ${parts.id} and s.key = ${specKey}
        )`,
      ),
    )
    // 최신 부품부터. 국내 유통 판정(#5) 전에는 이게 가장 쓸모 있는 우선순위다.
    .orderBy(sql`${parts.releaseYear} desc nulls last`, parts.modelName)
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
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
  const missing = PHASE0_REQUIREMENTS.filter(
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
