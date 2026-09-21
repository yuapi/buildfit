/**
 * 이름 검색 조건 — ADR-0017.
 *
 * 해석은 `@buildfit/compat`의 `searchTerms`가 하고, 여기서는 SQL로만 옮긴다.
 * 고르기(picker)와 카테고리 목록이 **같은 조건을 쓴다.** 두 벌이 되면
 * "고를 땐 나오는데 목록엔 없다"가 된다.
 */

import { type SearchTerms, isImpossible, searchTerms } from '@buildfit/compat';
import { type SQL, sql } from 'drizzle-orm';
import { parts } from '../schema';

export { searchTerms };
export type { SearchTerms };

/**
 * 검색어를 이름 조건으로 옮긴다.
 *
 * 조각은 전부 만족(AND), 조각 안의 후보는 하나만 맞으면 된다(OR).
 * "지포스 5080"은 `GeForce RTX 5080` 안에 그대로 들어있지 않다. 쪼개야 걸린다.
 *
 * **뜻을 모르는 한글이 섞이면 0건을 낸다.** 그 조각을 조용히 버리면
 * "다나와 5080"이 5080 전부를 부르게 된다. 모르는 것은 모른다고 해야 한다.
 */
export function nameWhere(parsed: SearchTerms): SQL[] {
  if (parsed.terms.length === 0) return [];
  if (isImpossible(parsed)) return [sql`false`];

  return parsed.terms.map((term) => {
    const alts = term.any.map((v) => sql`${parts.searchText} like ${`%${v}%`}`);
    return sql`(${sql.join(alts, sql` or `)})`;
  });
}
