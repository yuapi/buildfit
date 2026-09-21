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
import { type SQL, and, eq, ilike, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { partSpecs, parts } from '../schema';

export interface PartOption {
  readonly id: string;
  readonly name: string;
  readonly brand: string | null;
  readonly releaseYear: number | null;
}

export interface PickerPage {
  readonly items: readonly PartOption[];
  /** 제약 때문에 빠진 건수. 화면이 "N개를 숨겼습니다"로 쓴다 */
  readonly hidden: number;
}

/**
 * 제약 하나를 "어긋나는 스펙이 존재하는가"로 옮긴다.
 *
 * 숫자 비교 전에 `jsonb_typeof`로 막는다. OpenDB에 문자열로 들어온 값이 섞이면
 * 캐스팅이 던지고 검색 전체가 죽는다.
 */
function conflicts(c: Constraint): SQL {
  const key = sql`${partSpecs.key} = ${c.key}`;
  const text = sql`${partSpecs.value} #>> '{}'`;
  const num = sql`(${partSpecs.value} #>> '{}')::numeric`;
  const isNum = sql`jsonb_typeof(${partSpecs.value}) = 'number'`;

  switch (c.kind) {
    case 'equals':
      return sql`${key} and ${text} is distinct from ${c.value}`;
    case 'oneOf': {
      // 배열을 파라미터 하나로 넘기면 PG가 배열 리터럴로 읽지 못한다.
      // NULL이면 NOT IN이 NULL이라 이 행은 "어긋남"에 걸리지 않는다 — 남기는 쪽이라 맞다.
      const list = sql.join(
        c.values.map((v) => sql`${v}`),
        sql`, `,
      );
      return sql`${key} and ${text} not in (${list})`;
    }
    case 'contains':
      // 배열 스펙. jsonb ? 는 배열 원소를 본다. 배열이 아니면 건드리지 않는다.
      return sql`${key} and jsonb_typeof(${partSpecs.value}) = 'array' and not (${partSpecs.value} ? ${c.value})`;
    case 'atMost':
      return sql`${key} and ${isNum} and ${num} > ${c.value}`;
    case 'atLeast':
      return sql`${key} and ${isNum} and ${num} < ${c.value}`;
  }
}

function constraintWhere(c: Constraint): SQL {
  return sql`not exists (
    select 1 from ${partSpecs}
    where ${partSpecs.partId} = ${parts.id} and ${conflicts(c)}
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
  const q = input.query.trim();
  const base = q === '' ? [eq(parts.category, input.category)] : [
    eq(parts.category, input.category),
    ilike(parts.modelName, `%${q}%`),
  ];

  const narrowed = [...base, ...input.constraints.map(constraintWhere)];

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
        kept: sql<number>`count(*) filter (where ${and(...narrowed.slice(base.length)) ?? sql`true`})::int`,
      })
      .from(parts)
      .where(and(...base)),
  ]);

  const row = counts[0];
  const hidden = row ? Math.max(0, row.total - row.kept) : 0;
  return { items, hidden };
}
