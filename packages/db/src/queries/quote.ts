/**
 * 견적서 붙여넣기 — ADR-0018.
 *
 * 줄 하나에서 부품 하나를 찾는다. **아무것도 자동으로 채우지 않는다.**
 * 찾은 것을 보여주고, 사용자가 확인한 것만 견적에 들어간다.
 *
 * 매칭 규칙은 `@buildfit/compat`의 `quoteLineTerms`가 정한다. 여기서는
 * SQL로만 옮긴다 — 검색과 같은 `parts.search_text`를 본다 (ADR-0017).
 */

import { type QuoteLabel, readQuoteLine } from '@buildfit/compat';
import { and, inArray, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { parts } from '../schema';

/** 견적에 들어갈 수 있는 카테고리만 본다. `GPUChip`은 내부 레코드라 제외한다 */
export const QUOTE_CATEGORIES = [
  'CPU',
  'Motherboard',
  'RAM',
  'GPU',
  'PCCase',
  'PSU',
  'CPUCooler',
] as const;

/** 한 번에 볼 줄 수. 견적서는 길지 않다 — 그 이상은 붙여넣기 사고다 */
export const MAX_LINES = 40;
/** 한 줄이 보여줄 후보 수 */
export const MAX_CANDIDATES = 6;

export interface QuoteCandidate {
  readonly id: string;
  readonly name: string;
  readonly brand: string | null;
  readonly category: string;
  readonly releaseYear: number | null;
}

/**
 * 한 줄의 결과.
 *
 * 상태를 따로 넣지 않는다. 화면이 세 가지로 읽는다 —
 * `unsupported`면 다루지 않는 부품, 후보가 1개면 확정, 여럿이면 고르기,
 * 0개인데 `isPart`면 못 찾음, 0개이고 `isPart`가 아니면 부품 줄이 아니다.
 */
export interface QuoteLineResult {
  /** 원문. 화면이 그대로 보여준다 */
  readonly line: string;
  /** 줄 앞 이름표에서 알아낸 카테고리. 없으면 `null` */
  readonly category: string | null;
  /** 아직 다루지 않는 부품이면 그 이름 (스토리지·모니터 등) */
  readonly unsupported: string | null;
  /** 무엇으로 찾았는지. 왜 이게 나왔는지 설명할 수 있어야 한다 */
  readonly terms: readonly string[];
  /** 부품 이름이 아니라고 보고 뺀 말 */
  readonly ignored: readonly string[];
  /** 부품 줄로 볼 것인가. 합계·배송비 줄은 아니다 */
  readonly isPart: boolean;
  readonly candidates: readonly QuoteCandidate[];
  /** 후보가 더 있는가. 「2개 중 하나」와 「수십 개 중 여섯」은 다르다 */
  readonly hasMore: boolean;
}

/** 다루지 않는 부품이라고 이름표가 말했는가 */
function unsupportedOf(label: QuoteLabel | null): string | null {
  return label !== null && label.category === null ? label.label : null;
}

/**
 * 줄 하나를 찾는다.
 *
 * 조각은 전부 만족(AND)이다. 이름표가 카테고리를 말하면 **그 안에서만** 찾는다
 * — 「메인보드: ASUS PRIME …」이 케이스를 부르면 안 된다.
 */
async function matchLine(db: Database, line: string): Promise<QuoteLineResult> {
  const parsed = readQuoteLine(line);
  const terms = parsed.terms.map((t) => t.any.join(' 또는 '));
  const unsupported = unsupportedOf(parsed.label);
  const category = parsed.label?.category ?? null;
  const base = {
    line,
    category,
    unsupported,
    terms,
    ignored: parsed.ignored,
    isPart: parsed.isPart,
  };

  // 다루지 않는 부품은 찾지 않는다. 찾으면 엉뚱한 것이 걸린다 —
  // 「SSD: 삼성 990 PRO」로 삼성 메모리를 부를 이유가 없다.
  if (unsupported !== null || !parsed.isPart) {
    return { ...base, candidates: [], hasMore: false };
  }

  const where = and(
    inArray(parts.category, category === null ? [...QUOTE_CATEGORIES] : [category]),
    ...parsed.terms.map((term) => {
      const alts = term.any.map((v) => sql`${parts.searchText} like ${`%${v}%`}`);
      return sql`(${sql.join(alts, sql` or `)})`;
    }),
  );

  const rows = await db
    .select({
      id: parts.id,
      name: parts.modelName,
      brand: parts.brand,
      category: parts.category,
      releaseYear: parts.releaseYear,
    })
    .from(parts)
    .where(where)
    // 최신 것을 먼저 보여준다. 견적서에 올라오는 것은 대개 현행 세대다.
    .orderBy(sql`${parts.releaseYear} desc nulls last`, parts.modelName)
    // 한 개 더 가져와서 "더 있다"만 판단한다. 전체를 세려고 쿼리를 두 번 돌리지 않는다.
    .limit(MAX_CANDIDATES + 1);

  return {
    ...base,
    candidates: rows.slice(0, MAX_CANDIDATES),
    hasMore: rows.length > MAX_CANDIDATES,
  };
}

/**
 * 붙여넣은 글을 줄 단위로 찾는다.
 *
 * **형식을 가정하지 않는다.** 쇼핑몰마다 견적서 모양이 다르고, 이 환경에서
 * 실제 견적서를 확인할 방법이 없다. 줄을 나누고 부품처럼 생긴 것을 찾을 뿐이다.
 * 부품 줄이 아니면 후보가 0개로 나오고, 화면이 그렇게 말한다.
 */
export async function matchQuote(db: Database, text: string): Promise<QuoteLineResult[]> {
  const lines = (typeof text === 'string' ? text : '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .slice(0, MAX_LINES);

  // 줄마다 쿼리 하나다. trigram 인덱스로 줄당 2~5ms라 40줄이어도 괜찮다.
  return Promise.all(lines.map((l) => matchLine(db, l)));
}
