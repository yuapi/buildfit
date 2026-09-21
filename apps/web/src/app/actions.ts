'use server';

import type { Build, Constraint } from '@buildfit/compat';
import { loadBuild } from '@buildfit/db/build';
import { searchCandidates, type PartOption } from '@buildfit/db/picker';
import { matchQuote, type QuoteLineResult } from '@buildfit/db/quote';
import { SLOT_META, type SlotName } from '@/lib/categories';
import { getDb } from '@/lib/db';
import { MAX_LIMIT, MAX_QUOTE_CHARS, PAGE } from '@/lib/picker';

export type { PartOption };

export interface CandidatePage {
  readonly items: readonly PartOption[];
  /** 조건에 맞는 전체 건수. `items`는 그중 앞에서 몇 개다 */
  readonly matched: number;
  /** 제약 때문에 빠진 건수 */
  readonly hidden: number;
  /** 한글을 무엇으로 바꿔 찾았는지 (ADR-0017) */
  readonly translated: readonly { readonly from: string; readonly to: string }[];
  /** 뜻을 모르는 한글 조각. 있으면 결과는 0건이다 */
  readonly unknown: readonly string[];
}

/**
 * 클라이언트가 보낸 제약을 믿지 않고 형태를 확인한다.
 *
 * 값은 전부 파라미터로 들어가므로 주입은 안 되지만, 모양이 어긋나면 쿼리가
 * 던져서 검색 전체가 죽는다. 이상한 것은 조용히 버린다 — 좁히기가 덜 되는 것이
 * 검색이 죽는 것보다 낫다.
 */
function sanitize(raw: readonly Constraint[]): Constraint[] {
  // 기본값은 undefined만 막는다. null이 오면 slice가 던져 검색이 통째로 죽는다.
  if (!Array.isArray(raw)) return [];
  const out: Constraint[] = [];
  for (const c of raw.slice(0, 8)) {
    if (typeof c?.key !== 'string' || c.key.length > 64) continue;
    if (typeof c.ruleId !== 'number') continue;
    if (c.kind === 'equals' || c.kind === 'contains') {
      if (typeof c.value === 'string' && c.value.length <= 128) out.push(c);
    } else if (c.kind === 'oneOf') {
      const values = Array.isArray(c.values)
        ? (c.values as unknown[])
            .filter((v): v is string => typeof v === 'string' && v.length <= 128)
            .slice(0, 32)
        : [];
      if (values.length > 0) out.push({ ...c, values });
    } else if (c.kind === 'atMost' || c.kind === 'atLeast') {
      if (Number.isFinite(c.value)) out.push(c);
    }
  }
  return out;
}

/**
 * 조회 결과.
 *
 * **DB가 죽었을 때 화면이 통째로 죽지 않게** 던지지 않고 실패를 값으로 돌려준다.
 * "결과가 없음"과 "불러오지 못함"은 사용자가 할 행동이 다르므로 구분한다.
 */
export type QueryResult<T> = { readonly ok: true; readonly data: T } | { readonly ok: false };

/**
 * 부품 검색. 카테고리 안에서만 찾고, **이미 고른 부품과 아는데 어긋나는 것을 뺀다**
 * (ADR-0016).
 *
 * 값이 비어 있는 부품은 빼지 않는다. 숨기면 사용자가 그 부품을 찾을 방법이 없다.
 */
export async function searchParts(
  slot: SlotName,
  query: string,
  constraints: readonly Constraint[] = [],
  limit = PAGE,
): Promise<QueryResult<CandidatePage>> {
  const meta = SLOT_META.find((m) => m.slot === slot);
  if (!meta) {
    return { ok: true, data: { items: [], matched: 0, hidden: 0, translated: [], unknown: [] } };
  }

  try {
    const page = await searchCandidates(getDb(), {
      category: meta.category,
      query,
      constraints: sanitize(constraints),
      // 클라이언트가 보낸 값이다. 큰 수를 넣어 목록 전체를 한 번에 끌어가지
      // 못하게 막는다. 실수로 NaN이 와도 기본값으로 떨어뜨린다.
      limit: Number.isFinite(limit) ? Math.min(Math.max(PAGE, Math.trunc(limit)), MAX_LIMIT) : PAGE,
    });
    return { ok: true, data: page };
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

/**
 * 붙여넣은 견적서를 줄 단위로 찾는다 (ADR-0018).
 *
 * **아무것도 자동으로 채우지 않는다.** 찾은 것을 돌려줄 뿐이고, 견적에 넣는
 * 것은 사용자가 화면에서 확인한 뒤다.
 */
export async function readQuote(text: string): Promise<QueryResult<QuoteLineResult[]>> {
  // 클라이언트가 보낸 값이다. 길이를 먼저 자른다 — 줄 수 제한은 그 다음이다.
  const input = typeof text === 'string' ? text.slice(0, MAX_QUOTE_CHARS) : '';
  try {
    return { ok: true, data: await matchQuote(getDb(), input) };
  } catch {
    return { ok: false };
  }
}
