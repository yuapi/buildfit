/**
 * 이름 검색 조건 — ADR-0017.
 *
 * 해석은 `@buildfit/compat`의 `searchTerms`가 하고, 여기서는 SQL로만 옮긴다.
 * 고르기(picker)와 카테고리 목록이 **같은 조건을 쓴다.** 두 벌이 되면
 * "고를 땐 나오는데 목록엔 없다"가 된다.
 */

import { type SearchTerms, isImpossible, searchTerms } from '@buildfit/compat';
import { type SQL, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { parts } from '../schema';

export { searchTerms };
export type { SearchTerms };

/**
 * 한 검색에 붙일 조건 수의 상한.
 *
 * 호출부가 길이를 자르지만, 여기가 DB 앞의 마지막 지점이다. 이름 하나를
 * 가리키는 데 40조각이면 이미 지나치게 좁고, 그 이상은 찾는 행위가 아니다.
 */
const MAX_TERMS = 40;

/**
 * 검색어를 이름 조건으로 옮긴다.
 *
 * 조각은 전부 만족(AND), 조각 안의 후보는 하나만 맞으면 된다(OR).
 * "지포스 5080"은 `GeForce RTX 5080` 안에 그대로 들어있지 않다. 쪼개야 걸린다.
 *
 * **뜻을 모르는 한글이 섞이면 0건을 낸다.** 그 조각을 조용히 버리면
 * "다나와 5080"이 5080 전부를 부르게 된다. 모르는 것은 모른다고 해야 한다.
 */
/**
 * 목록에 보일 부품인가 — 대표만 보인다.
 *
 * 같은 제품이 여러 레코드로 들어 있어 검색 한 페이지에 같은 것이 7번 나왔다.
 * **id로는 여전히 열린다** — 공유 링크가 담은 id를 막으면 링크가 깨진다
 * (ADR-0012). 목록·검색·sitemap만 좁힌다.
 *
 * 근거: `docs/research/duplicate-parts.md`
 */
export function canonicalOnly(): SQL {
  return sql`${parts.duplicateOf} is null`;
}

export function nameWhere(parsed: SearchTerms): SQL[] {
  if (parsed.terms.length === 0) return [];
  if (isImpossible(parsed)) return [sql`false`];

  return parsed.terms.slice(0, MAX_TERMS).map((term) => {
    const alts = term.any.map((v) => sql`${parts.searchText} like ${`%${v}%`}`);
    return sql`(${sql.join(alts, sql` or `)})`;
  });
}

/** 한 카테고리에서 걸린 것들 */
export interface CategoryHits {
  readonly category: string;
  /** 이 카테고리에서 맞는 전체 건수. `items`는 그중 앞에서 몇 개다 */
  readonly total: number;
  readonly items: readonly {
    readonly slug: string;
    readonly modelName: string;
    readonly brand: string | null;
    readonly releaseYear: number | null;
  }[];
}

export interface AcrossCategories {
  /** 걸린 것이 있는 카테고리만. 많이 걸린 순 */
  readonly groups: readonly CategoryHits[];
  /** 한글을 무엇으로 바꿔 찾았는지 (ADR-0017) */
  readonly translated: readonly { readonly from: string; readonly to: string }[];
  /** 뜻을 모르는 한글 조각. 있으면 결과는 0건이다 */
  readonly unknown: readonly string[];
}

/**
 * 카테고리를 가로질러 찾는다.
 *
 * 부품 목록 첫 화면에서 쓴다. 전에는 **카테고리를 먼저 고르지 않으면 아무것도
 * 찾을 수 없었다** — 「9800X3D」가 CPU인 줄 아는 사람에게만 쓸모 있는 구조였다.
 *
 * 고르기·카테고리 목록과 **같은 해석**을 쓴다 (`nameWhere`). 세 벌이 되면
 * 화면마다 결과가 달라진다.
 */
export async function searchAcrossCategories(
  db: Database,
  input: {
    query: string;
    /** 찾을 카테고리. 정책은 호출부가 정한다 — DB 계층이 GPUChip을 알 이유가 없다 */
    categories: readonly string[];
    /** 카테고리마다 보여줄 개수 */
    perCategory?: number;
  },
): Promise<AcrossCategories> {
  const parsed = searchTerms(input.query);
  const where = nameWhere(parsed);
  const empty = { groups: [], translated: parsed.translated, unknown: parsed.unknown };
  // 검색어가 없으면 전부를 끌어오지 않는다. 그건 목록 페이지가 할 일이다.
  if (where.length === 0 || input.categories.length === 0) return empty;

  const per = Math.min(Math.max(1, input.perCategory ?? 5), 20);

  /**
   * 카테고리마다 앞에서 몇 개씩 — **쿼리 하나로** 뽑는다.
   *
   * 카테고리별로 따로 돌면 여덟 번이다. 창 함수로 순번을 매겨 한 번에 자른다.
   */
  const rows = await db.execute<{
    category: string;
    slug: string;
    model_name: string;
    brand: string | null;
    release_year: number | null;
    total: number;
  }>(sql`
    with matched as (
      select
        ${parts.category} as category,
        ${parts.slug} as slug,
        ${parts.modelName} as model_name,
        ${parts.brand} as brand,
        ${parts.releaseYear} as release_year,
        row_number() over (
          partition by ${parts.category}
          order by ${parts.releaseYear} desc nulls last, ${parts.modelName}
        ) as rn,
        count(*) over (partition by ${parts.category}) as total
      from ${parts}
      where ${parts.category} in (${sql.join(
        input.categories.map((c) => sql`${c}`),
        sql`, `,
      )})
        and ${sql.join(where, sql` and `)}
    )
    select category, slug, model_name, brand, release_year, total::int as total
    from matched where rn <= ${per}
    order by total desc, category, rn
  `);

  const byCategory = new Map<string, { total: number; items: CategoryHits['items'] }>();
  for (const r of rows) {
    const found = byCategory.get(r.category) ?? { total: r.total, items: [] };
    byCategory.set(r.category, {
      total: r.total,
      items: [
        ...found.items,
        {
          slug: r.slug,
          modelName: r.model_name,
          brand: r.brand,
          releaseYear: r.release_year,
        },
      ],
    });
  }

  return {
    groups: [...byCategory].map(([category, v]) => ({ category, ...v })),
    translated: parsed.translated,
    unknown: parsed.unknown,
  };
}
