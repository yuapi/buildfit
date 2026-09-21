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
  /**
   * 뺀 조각.
   *
   * 사전에 없는 한글, 그리고 **붙일 자리가 없어 버린 짧은 영문**이다.
   * 조용히 버리면 왜 그 줄이 그렇게 나왔는지 설명할 수 없다.
   */
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
  // 「CPU:」 「[CPU]」 「CPU - …」 「CPU |」 「CPU-…」 — **구분자가 있어야** 이름표로
  // 본다. 구분자 없이 앞 낱말만 보면 「Corsair ...」의 첫 낱말도 이름표가 된다.
  // 대괄호는 그 자체가 구분자다.
  const bracket = /^\s*\[\s*([0-9A-Za-z가-힣/ ]{1,12}?)\s*\]\s*(.*)$/.exec(line);
  // 하이픈 앞의 공백을 따로 잡는다. 붙여 쓴 것과 띄어 쓴 것의 뜻이 다르다.
  const m = bracket ?? /^\s*([0-9A-Za-z가-힣/]{1,12})(\s*)([:|\t-])\s*(.*)$/.exec(line);
  if (!m) return { label: null, rest: line };

  const head = (m[1] ?? '').toLowerCase().replace(/[\s/]/g, '');
  const rest = (bracket ? m[2] : m[4]) ?? '';

  /**
   * 붙여 쓴 하이픈 뒤의 **두 글자 영문**은 이름표로 보지 않는다.
   *
   * 모델명·파트넘버 안에 하이픈이 흔하고, 짧을수록 겹친다. Samsung MPN
   * `MB-ME32GA`를 이름표로 읽으면 메인보드 카테고리로 좁혀져 0건이 난다.
   *
   * 세 글자 이상(`CPU-`, `SSD-`, `VGA-`)이나 한글(`램-`)은 그대로 받는다 —
   * 파트넘버에 한글이 없고, 세 글자 접두사가 겹칠 일은 드물다.
   * 두 글자라도 `MB:`·`[MB]`·`MB - …`처럼 다른 구분자거나 띄어 썼으면 이름표다 —
   * 파트넘버는 하이픈 앞에 공백을 두지 않는다.
   */
  const tightHyphen = !bracket && m[3] === '-' && m[2] === '';
  if (tightHyphen && head.length <= 2 && !HANGUL.test(head)) {
    return { label: null, rest: line };
  }

  const found = QUOTE_LABELS.find((l) => l.words.includes(head));
  return found ? { label: found, rest } : { label: null, rest: line };
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
  /**
   * 앞에 붙일 자리가 없어 들고 있는 짧은 조각.
   *
   * 「CPU: i5-12400」의 `i5`가 그렇다. 버리면 `12400`만 남고, 글자가 없어서
   * **부품 줄이 아닌 것으로 판정돼 줄이 통째로 사라졌다.** 이름표가 CPU라고
   * 말하고 있는데도 그랬다.
   *
   * 그래서 뒤로 붙인다 — `i5` + `12400` → `i512400`.
   * `Intel Core i5-12400`은 구분자를 지우면 `intelcorei512400`이라 그대로 걸린다.
   *
   * **줄 맨 앞에서만 한다.** 뒤로 붙이는 것은 앞에 아무것도 없을 때의 유일한
   * 방향이기 때문이다. 중간에서 하면 사이에 버린 말이 끼어 있는지 알 수 없다 —
   * 「RTX 5080 게이밍 트리오 OC 16G」의 `OC`를 `16G`에 붙이면 `oc16g`가 되는데
   * 그런 이름은 없다. (뒤에서 앞으로 붙이는 규칙도 같은 이유로 바로 앞만 본다.)
   */
  let pending: string | null = null;
  /** 이 줄에서 조각을 하나라도 봤는가. 맨 앞인지 가리는 데 쓴다 */
  let seen = false;

  /** 들고 있던 조각을 버린다. 무엇을 버렸는지는 남긴다 */
  const dropPending = (): void => {
    if (pending !== null) ignored.push(pending);
    pending = null;
  };

  for (const chunk of chunks(rest)) {
    const first = !seen;
    seen = true;

    if (HANGUL.test(chunk)) {
      // 한글에는 붙이지 않는다. `i5인텔`이라는 이름은 없다.
      dropPending();
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
      // 들고 있던 짧은 조각이 있으면 **앞에** 붙인다. 원문 순서 그대로다.
      const merged = pending !== null ? pending + s : s;
      pending = null;
      terms.push({ raw: chunk, any: [merged] });
      joinable = true;
      continue;
    }

    // 짧은 조각. 혼자서는 아무것도 가리지 못한다 — `ti`는 `Edition` 안에도 있다.
    const i = terms.length - 1;
    const prev = terms[i];
    if (opts.mergeShort !== false && joinable && prev !== undefined) {
      terms[i] = { raw: `${prev.raw}${chunk}`, any: [(prev.any[0] as string) + s] };
      joinable = false;
      continue;
    }
    // 붙일 앞이 없다. 줄 맨 앞이면 뒤에 올 조각에 붙이려고 들고 있는다.
    dropPending();
    if (first && opts.mergeShort !== false) pending = s;
    else ignored.push(chunk);
    joinable = false;
  }
  // 줄 끝에 남은 것은 붙일 데가 없다.
  dropPending();

  /**
   * 부품 줄로 볼 것인가.
   *
   * 글자가 든 조각이 있으면 부품 줄이다. 그리고 **이름표가 부품을 말하면
   * 그것으로 충분하다** — 사용자가 「CPU:」라고 적었는데 우리가 "부품 줄이
   * 아니다"라고 하면, 못 찾았다는 말조차 못 보게 된다.
   */
  const isPart =
    terms.some((t) => t.any.some((v) => /[a-z]/.test(v))) ||
    (label !== null && terms.length > 0);
  return { label, terms, ignored, isPart };
}
