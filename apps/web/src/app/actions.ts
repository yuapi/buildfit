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

/**
 * 조회 결과.
 *
 * **DB가 죽었을 때 화면이 통째로 죽지 않게** 던지지 않고 실패를 값으로 돌려준다.
 * "결과가 없음"과 "불러오지 못함"은 사용자가 할 행동이 다르므로 구분한다.
 */
export type QueryResult<T> = { readonly ok: true; readonly data: T } | { readonly ok: false };

/** 부품 검색. 카테고리 안에서만 찾는다. */
export async function searchParts(
  slot: SlotName,
  query: string,
): Promise<QueryResult<PartOption[]>> {
  const meta = SLOT_META.find((m) => m.slot === slot);
  if (!meta) return { ok: true, data: [] };
  const q = query.trim();

  const where =
    q === ''
      ? eq(parts.category, meta.category)
      : and(eq(parts.category, meta.category), ilike(parts.modelName, `%${q}%`));

  try {
    const data = await getDb()
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
    return { ok: true, data };
  } catch {
    return { ok: false };
  }
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
}): Promise<QueryResult<Build>> {
  try {
    return { ok: true, data: await loadBuild(getDb(), selection) };
  } catch {
    return { ok: false };
  }
}
