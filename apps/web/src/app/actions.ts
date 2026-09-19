'use server';

import type { Build } from '@buildfit/compat';
import { parts } from '@buildfit/db';
import { loadBuild } from '@buildfit/db/build';
import { and, eq, ilike, sql } from 'drizzle-orm';
import { SLOT_META, type SlotName } from '@/lib/categories';
import { getDb } from '@/lib/db';

export interface PartOption {
  readonly id: string;
  readonly name: string;
  readonly brand: string | null;
  readonly releaseYear: number | null;
}

/** 부품 검색. 카테고리 안에서만 찾는다. */
export async function searchParts(slot: SlotName, query: string): Promise<PartOption[]> {
  const meta = SLOT_META.find((m) => m.slot === slot);
  if (!meta) return [];
  const q = query.trim();

  const where =
    q === ''
      ? eq(parts.category, meta.category)
      : and(eq(parts.category, meta.category), ilike(parts.modelName, `%${q}%`));

  return getDb()
    .select({
      id: parts.id,
      name: parts.modelName,
      brand: parts.brand,
      releaseYear: parts.releaseYear,
    })
    .from(parts)
    .where(where)
    // 최신 부품 먼저. 국내 유통 판정(#5) 전에는 이게 가장 쓸모 있는 순서다.
    .orderBy(sql`${parts.releaseYear} desc nulls last`, parts.modelName)
    .limit(30);
}

/**
 * 고른 부품들의 판정용 객체를 가져온다.
 *
 * 클라이언트가 이 객체를 들고 **직접 규칙 엔진을 돌린다** (ADR-0010).
 * 부품을 빼거나 바꿀 때 서버 왕복 없이 즉시 다시 판정된다.
 */
export async function fetchBuildParts(selection: {
  cpu?: string | undefined;
  motherboard?: string | undefined;
  gpu?: string | undefined;
  pcCase?: string | undefined;
  psu?: string | undefined;
  ram?: readonly string[] | undefined;
}): Promise<Build> {
  return loadBuild(getDb(), selection);
}
