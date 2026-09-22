/**
 * 후보 검색 — ADR-0016.
 *
 * `pickerConstraints`가 만든 제약을 SQL로 옮긴다.
 *
 * **모든 조건이 `not exists`다.** 스펙이 있는데 어긋나는 것만 뺀다.
 * `exists`로 뒤집으면 스펙이 비어 있다는 이유로 멀쩡한 부품이 사라지고,
 * 사용자는 그 부품을 찾을 방법이 없어진다. 좁히기는 판정이 아니다.
 */

import type { Constraint } from '@buildfit/compat';
import { type SQL, and, eq, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { partSpecs, parts } from '../schema';
import { canonicalOnly, nameWhere, searchTerms } from './search';

export interface PartOption {
  readonly id: string;
  readonly name: string;
  readonly brand: string | null;
  readonly releaseYear: number | null;
}

export interface PickerPage {
  readonly items: readonly PartOption[];
  /**
   * 조건에 맞는 전체 건수. `items`는 그중 앞에서 `limit`개다.
   *
   * 이걸 말하지 않으면 2,677개 중 30개를 보여주면서 그게 전부인 것처럼 보인다.
   * 사용자는 자기가 찾는 것이 목록에 없다고 판단하고 그만둔다.
   */
  readonly matched: number;
  /** 제약 때문에 빠진 건수. 화면이 "N개를 숨겼습니다"로 쓴다 */
  readonly hidden: number;
  /** 한글을 무엇으로 바꿔 찾았는지. 화면이 그대로 말한다 (ADR-0017) */
  readonly translated: readonly { readonly from: string; readonly to: string }[];
  /** 뜻을 모르는 한글 조각. 있으면 결과는 0건이다 */
  readonly unknown: readonly string[];
}

/**
 * 제약 하나를 "어긋나는 스펙이 존재하는가"로 옮긴다.
 *
 * **타입이 기대와 다르거나 비어 있으면 어긋남으로 세지 않는다.**
 * `'null'::jsonb #>> '{}'`는 SQL NULL이고 `NULL is distinct from 'AM5'`는 참이라,
 * 막지 않으면 값이 없는 행이 "어긋남"으로 잡혀 부품이 사라진다. ADR-0016이
 * 세운 선("아는데 어긋나는 것만 뺀다")이 바로 여기서 깨진다.
 *
 * 지금 데이터에는 그런 행이 없지만(196,854행 전수 확인) 스키마가 허용한다.
 * 이 SQL이 유일한 강제 지점이다.
 */
function conflicts(c: Constraint): SQL {
  const key = sql`${partSpecs.key} = ${c.key}`;
  const text = sql`${partSpecs.value} #>> '{}'`;
  const num = sql`(${partSpecs.value} #>> '{}')::numeric`;
  const isNum = sql`jsonb_typeof(${partSpecs.value}) = 'number'`;
  // 빈 문자열은 값이 아니다. build.ts의 str()도 ''를 결측으로 본다.
  const isText = sql`jsonb_typeof(${partSpecs.value}) = 'string' and btrim(${text}) <> ''`;

  switch (c.kind) {
    case 'equals':
      return sql`${key} and ${isText} and ${text} is distinct from ${c.value}`;
    case 'oneOf': {
      // 배열을 파라미터 하나로 넘기면 PG가 배열 리터럴로 읽지 못한다.
      // NULL이면 NOT IN이 NULL이라 이 행은 "어긋남"에 걸리지 않는다 — 남기는 쪽이라 맞다.
      const list = sql.join(
        c.values.map((v) => sql`${v}`),
        sql`, `,
      );
      return sql`${key} and ${isText} and ${text} not in (${list})`;
    }
    case 'contains':
      // 배열 스펙. jsonb ? 는 배열 원소를 본다. 배열이 아니면 건드리지 않는다.
      // 빈 배열은 아무것도 말하지 않는다 — picker.ts의 filled()도 그렇게 본다.
      return sql`${key}
        and jsonb_typeof(${partSpecs.value}) = 'array'
        and jsonb_array_length(${partSpecs.value}) > 0
        and not (${partSpecs.value} ? ${c.value})`;
    case 'atMost':
      // ignoreAbove보다 큰 값은 단위를 잘못 적은 것이라 어긋남으로 치지 않는다.
      // 규칙이 판정 불가로 두는 값을 거르기가 숨기면 그 부품을 찾을 길이 없다.
      return c.ignoreAbove === undefined
        ? sql`${key} and ${isNum} and ${num} > ${c.value}`
        : sql`${key} and ${isNum} and ${num} > ${c.value} and ${num} <= ${c.ignoreAbove}`;
    case 'atLeast':
      return sql`${key} and ${isNum} and ${num} < ${c.value}`;
  }
}

/**
 * 제약 하나를 where 절로 옮긴다.
 *
 * **「검증 중」인 행으로는 숨기지 않는다** (이슈 #14). 다투어지는 값은 아는 값이
 * 아니다 — 결측·단위 오류와 같은 자리다. 판정이 틀리면 사용자가 그 부품을 보고
 * 의심할 수 있지만(이슈 #13이 「검증 중」이라고 적는다), 거르기가 숨기면
 * **그 부품을 찾을 길이 없다.** ADR-0016이 세운 선("아는데 어긋나는 것만 뺀다").
 */
function constraintWhere(c: Constraint): SQL {
  return sql`not exists (
    select 1 from ${partSpecs}
    where ${partSpecs.partId} = ${parts.id}
      and ${partSpecs.disputed} = false
      and ${conflicts(c)}
  )`;
}

/**
 * 카테고리 안에서 이름으로 찾되, 고른 부품과 **아는데 어긋나는 것**을 뺀다.
 *
 * `hidden`을 함께 돌려준다. 몇 개를 왜 숨겼는지 말하지 않으면 사용자는
 * 목록이 짧은 이유를 알 수 없다.
 */
export async function searchCandidates(
  db: Database,
  input: {
    category: string;
    query: string;
    constraints: readonly Constraint[];
    limit?: number;
  },
): Promise<PickerPage> {
  // 클라이언트가 보낸 값이다. 문자열이 아니면 빈 검색으로 떨어뜨린다.
  const q = typeof input.query === 'string' ? input.query : '';
  const parsed = searchTerms(q);
  // 대표만 보여준다. 같은 제품이 7번 나오면 목록이 쓸모없다
  const base = [eq(parts.category, input.category), canonicalOnly(), ...nameWhere(parsed)];

  // 제약 조건을 따로 들고 있는다. `narrowed.slice(base.length)`로 되찾으면
  // 나중에 base에 조건을 하나 더 넣는 순간 hidden이 조용히 틀린 값을 센다.
  const constraintSql = input.constraints.map(constraintWhere);
  const narrowed = [...base, ...constraintSql];

  const [items, counts] = await Promise.all([
    db
      .select({
        id: parts.id,
        name: parts.modelName,
        brand: parts.brand,
        releaseYear: parts.releaseYear,
      })
      .from(parts)
      .where(and(...narrowed))
      // 최신 부품 먼저. 카탈로그가 구세대에 치우쳐 있다.
      .orderBy(sql`${parts.releaseYear} desc nulls last`, parts.modelName)
      .limit(input.limit ?? 30),
    db
      .select({
        total: sql<number>`count(*)::int`,
        kept: sql<number>`count(*) filter (where ${and(...constraintSql) ?? sql`true`})::int`,
      })
      .from(parts)
      .where(and(...base)),
  ]);

  const row = counts[0];
  const hidden = row ? Math.max(0, row.total - row.kept) : 0;
  return {
    items,
    matched: row?.kept ?? items.length,
    hidden,
    translated: parsed.translated,
    unknown: parsed.unknown,
  };
}
