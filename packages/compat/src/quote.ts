/**
 * 견적서 한 줄 읽기 — ADR-0018.
 *
 * 국내 사용자는 조립 PC 견적서를 받아 들고 온다. 일곱 칸을 손으로 채우는 대신
 * 그 글을 붙여넣어 검증할 수 있어야 한다. 이 도구가 하는 일이 **판정**이고,
 * 판정하려면 부품이 먼저 들어와야 한다.
 *
 * **검색창과 정책이 다르다.** 검색창에서는 사용자가 친 말이 전부 뜻이 있으므로
 * 모르는 한글이 있으면 0건을 낸다 (ADR-0017 §5). 견적서는 반대다 —
 * 「정품」·「멀티팩」·「대원씨티에스」처럼 부품 이름이 아닌 말이 섞여 있고,
 * 그것 때문에 줄 전체가 못 찾음이 되면 쓸 수 없다.
 *
 * 그래서 **모르는 한글은 버린다.** 대신 안전장치를 둔다 —
 * 찾은 것이 하나가 아니면 고르게 하고, **아무것도 자동으로 채우지 않는다.**
 * 사용자가 눈으로 확인하고 누른 것만 견적에 들어간다.
 *
 * **형식을 가정하지 않는다.** 쇼핑몰마다 견적서 모양이 다르고, 이 환경에서
 * 실제 견적서를 확인할 방법이 없다. 줄을 나누고 부품처럼 생긴 것을 찾을 뿐이다.
 */

import { type Term, lookupExact, squash } from './search';

const HANGUL = /[가-힣ㄱ-ㆎ]/;
/** 짧은 영문·숫자 조각의 경계. `Ti`·`OC`·`i5`·`A` */
const SHORT = 2;

/**
 * 줄 앞에 붙는 부품 이름표.
 *
 * `category`가 있으면 그 카테고리로 좁힌다. `null`이면 **우리가 다루지 않는
 * 부품**이라는 뜻이다 — 못 찾은 것과 다루지 않는 것은 사용자가 할 행동이 다르다.
 * "찾지 못했습니다"는 다시 쳐보게 만들지만, "아직 다루지 않습니다"는 그렇지 않다.
 */
export interface QuoteLabel {
  readonly words: readonly string[];
  /** 카탈로그 카테고리. 취급하지 않는 부품이면 `null` */
  readonly category: string | null;
  /** 취급하지 않는 것을 화면에 뭐라고 쓸지 */
  readonly label: string;
}

export const QUOTE_LABELS: readonly QuoteLabel[] = [
  { words: ['cpu', '시피유', '프로세서'], category: 'CPU', label: 'CPU' },
  { words: ['메인보드', '마더보드', '보드', 'mb', 'mainboard'], category: 'Motherboard', label: '메인보드' },
  { words: ['메모리', '램', 'ram', 'memory'], category: 'RAM', label: '메모리' },
  { words: ['그래픽카드', '그래픽', 'vga', 'gpu', '비디오카드'], category: 'GPU', label: '그래픽카드' },
  { words: ['케이스', 'case', '본체'], category: 'PCCase', label: '케이스' },
  { words: ['파워', '파워서플라이', 'psu', 'power'], category: 'PSU', label: '파워' },
  { words: ['쿨러', 'cpu쿨러', '공냉쿨러', '수냉쿨러', 'cooler'], category: 'CPUCooler', label: 'CPU 쿨러' },

  // 아직 다루지 않는 것들. **못 찾은 것과 구분해서 말하려고** 적어둔다.
  { words: ['ssd', 'hdd', '저장장치', '스토리지', 'nvme', 'storage'], category: null, label: '스토리지' },
  { words: ['모니터', 'monitor'], category: null, label: '모니터' },
  { words: ['키보드', '마우스', 'keyboard', 'mouse'], category: null, label: '입력장치' },
  { words: ['os', '운영체제', '윈도우', 'windows'], category: null, label: '운영체제' },
  { words: ['쿨링팬', '시스템쿨러', '케이스팬'], category: null, label: '케이스 팬' },
];

export interface QuoteLine {
  /** 이름표가 있었으면 그것. 없으면 `null` */
  readonly label: QuoteLabel | null;
  /** 전부 만족해야 한다 (AND) */
  readonly terms: readonly Term[];
  /** 뜻을 몰라 뺀 한글 조각 */
  readonly ignored: readonly string[];
  /**
   * 부품 줄로 볼 것인가.
   *
   * **글자가 든 조각이 하나도 없으면 부품 줄이 아니다.** 「합계 2,480,000원」은
   * 숫자만 남아 `480`·`000`이 되는데, 그걸로 찾으면 엉뚱한 부품이 줄줄이 나온다.
   * 부품 이름에는 반드시 글자가 있다.
   */
  readonly isPart: boolean;
}

/**
 * 줄을 덩어리로 자른다.
 *
 * 글자·숫자·한글이 아닌 것은 전부 경계다 — 괄호·하이픈·쉼표·탭. 그리고
 * **한글과 영문이 붙어 있으면 거기서도 자른다**: 「라이젠7」은 두 덩어리다.
 */
function chunks(line: string): string[] {
  const out: string[] = [];
  for (const raw of line.split(/[^0-9A-Za-z가-힣ㄱ-ㆎ]+/)) {
    if (raw === '') continue;
    out.push(...(raw.match(/[가-힣ㄱ-ㆎ]+|[0-9A-Za-z]+/g) ?? []));
  }
  return out;
}

/**
 * 줄 앞의 이름표를 뗀다.
 *
 * 「CPU: …」의 `CPU`를 검색 조각으로 쓰면 이름에 `cpu`가 든 부품만 찾게 되어
 * **줄이 통째로 빗나간다.** 실제로 9800X3D 줄이 그래서 0건이 났다.
 * 이름표는 찾는 말이 아니라 **어디서 찾을지**를 말한다.
 */
function splitLabel(line: string): { label: QuoteLabel | null; rest: string } {
  // 「CPU:」 「[CPU]」 「CPU -」 「CPU |」 — **구분자가 있어야** 이름표로 본다.
  // 구분자 없이 앞 낱말만 보면 「Corsair ...」의 첫 낱말도 이름표가 된다.
  // 대괄호는 그 자체가 구분자다.
  const m =
    /^\s*\[\s*([0-9A-Za-z가-힣/ ]{1,12}?)\s*\]\s*(.*)$/.exec(line) ??
    /^\s*([0-9A-Za-z가-힣/]{1,12})\s*[:\-|\t]\s*(.*)$/.exec(line);
  if (!m) return { label: null, rest: line };

  const head = (m[1] ?? '').toLowerCase().replace(/[\s/]/g, '');
  const found = QUOTE_LABELS.find((l) => l.words.includes(head));
  return found ? { label: found, rest: m[2] ?? '' } : { label: null, rest: line };
}

export interface QuoteOptions {
  /**
   * 짧은 영문 조각(`Ti`, `OC`, `i5`)을 앞 조각에 붙일지. **기본은 붙인다.**
   *
   * 실측으로 갈랐다 — 붙이면 한 줄이 부품 하나로 확정되는 비율이
   * 60.2% → 69.8%로 오르고, 여럿일 때 평균 개수가 3.8 → 2.7로 준다.
   * 어느 쪽이든 **단일 오답은 0건**이었다 (n=420).
   * 근거: `docs/research/quote-line-matching.md`
   */
  readonly mergeShort?: boolean;
}

export function readQuoteLine(line: string, opts: QuoteOptions = {}): QuoteLine {
  const { label, rest } = splitLabel(line);
  const terms: Term[] = [];
  const ignored: string[] = [];

  /**
   * 바로 앞 덩어리가 조각이 됐는가.
   *
   * **바로 앞에만 붙인다.** 사이에 버린 말이 끼어 있으면 붙이지 않는다 —
   * 「RTX 5080 게이밍 트리오 OC」에서 `OC`를 `5080`에 붙이면 `5080oc`가 되는데
   * 그런 이름은 없다. 두 번 붙이는 것도 막는다 (`라이젠7-5세대` → `ryzen75`).
   */
  let joinable = false;

  for (const chunk of chunks(rest)) {
    if (HANGUL.test(chunk)) {
      const hits = lookupExact(chunk);
      if (hits.length === 0) {
        ignored.push(chunk);
        joinable = false;
      } else {
        terms.push({ raw: chunk, any: hits });
        joinable = hits.length === 1;
      }
      continue;
    }

    const s = squash(chunk);
    if (s === '') continue;
    if (s.length > SHORT) {
      terms.push({ raw: chunk, any: [s] });
      joinable = true;
      continue;
    }

    // 짧은 조각. 혼자서는 아무것도 가리지 못한다 — `ti`는 `Edition` 안에도 있다.
    const i = terms.length - 1;
    const prev = terms[i];
    if (opts.mergeShort !== false && joinable && prev !== undefined) {
      terms[i] = { raw: `${prev.raw}${chunk}`, any: [(prev.any[0] as string) + s] };
    }
    // 붙일 자리가 없으면 버린다. 남겨두면 목록이 엉뚱하게 넓어진다.
    joinable = false;
  }

  const isPart = terms.some((t) => t.any.some((v) => /[a-z]/.test(v)));
  return { label, terms, ignored, isPart };
}
