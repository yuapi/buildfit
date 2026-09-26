/**
 * 부품 이름 검색어 해석 — ADR-0017.
 *
 * 검색은 `model_name ilike '%q%'` 하나뿐이었다. 그래서 한국 사용자가 실제로 치는
 * 말이 전부 빗나갔다 — 라이젠·지포스·삼성·에이수스 전부 0건이었다 (실측).
 * 띄어쓰기 한 칸에도 어긋났다: `rtx 4070`은 273건, `rtx4070`은 0건.
 *
 * 여기서 하는 일은 셋이다.
 *
 * 1. **한글 표기를 영문으로 바꾼다.** 카탈로그(BuildCores OpenDB)는 전부 영문이다
 * 2. **붙여쓰기·띄어쓰기·하이픈을 지운다.** 양쪽을 같은 모양으로 눌러서 맞댄다
 * 3. **조각으로 쪼개 전부 만족(AND)을 요구한다.** "지포스 5080"은 이름에 그대로
 *    들어있지 않다. `GeForce RTX 5080`은 두 조각으로 갈라야 걸린다
 *
 * **DB에 의존하지 않는다.** 같은 규칙을 SQL 쪽(`parts.search_text`)이 생성 컬럼으로
 * 갖고 있고, 이 모듈의 `squash`와 글자 하나까지 같아야 한다. 어긋나면 검색이
 * 조용히 빗나간다 — 테스트가 두 정의를 함께 고정한다.
 */

/** 한글 음절 영역 */
const SYL_BASE = 0xac00;
const SYL_LAST = 0xd7a3;
const JONG_COUNT = 28;

/** 호환 자모 (ㄱ, ㅏ …). IME가 조합 중일 때 마지막 글자로 남는다 */
function isJamo(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return c >= 0x3131 && c <= 0x318e;
}

function isSyllable(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return c >= SYL_BASE && c <= SYL_LAST;
}

/** 받침을 떼어낸 음절. 받침이 없거나 한글이 아니면 그대로 */
function stripJong(ch: string): string {
  if (!isSyllable(ch)) return ch;
  const off = ch.charCodeAt(0) - SYL_BASE;
  const jong = off % JONG_COUNT;
  return jong === 0 ? ch : String.fromCharCode(SYL_BASE + (off - jong));
}

function hasHangul(s: string): boolean {
  return [...s].some((ch) => isSyllable(ch) || isJamo(ch));
}

/**
 * 비교용 모양. **영문 소문자와 숫자만 남긴다.**
 *
 * `parts.search_text`(생성 컬럼)의 `regexp_replace(lower(…), '[^a-z0-9]', '', 'g')`와
 * 같은 규칙이다. 양쪽이 어긋나면 검색이 조용히 빗나간다.
 */
export function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * 한글 표기 → 카탈로그의 영문 조각.
 *
 * `ko`가 여럿인 것은 표기가 갈리기 때문이다 (써멀/서멀, 에이수스/아수스).
 * `en`은 **`squash`를 거친 모양**으로 적는다 — 카탈로그와 맞댈 값이다.
 *
 * 넣기 전에 **카탈로그에 실제로 걸리는지 확인한다.** 수치와 확인 방법은
 * `docs/research/korean-search-terms.md`에 있다. 걸리지 않는 항목도
 * 잘못된 표기가 아니라면 남긴다 — 취급하지 않는 브랜드라는 사실 자체가 답이다.
 */
export interface KoAlias {
  readonly ko: readonly string[];
  readonly en: string;
}

export const KO_ALIASES: readonly KoAlias[] = [
  // --- CPU ---------------------------------------------------------------
  { ko: ['라이젠'], en: 'ryzen' },
  { ko: ['스레드리퍼', '쓰레드리퍼'], en: 'threadripper' },
  { ko: ['인텔'], en: 'intel' },
  { ko: ['코어'], en: 'core' },
  { ko: ['울트라'], en: 'ultra' },
  { ko: ['제온'], en: 'xeon' },
  { ko: ['에이엠디'], en: 'amd' },

  // --- GPU ---------------------------------------------------------------
  { ko: ['지포스'], en: 'geforce' },
  { ko: ['라데온'], en: 'radeon' },
  { ko: ['엔비디아'], en: 'nvidia' },
  { ko: ['아크'], en: 'arc' },
  { ko: ['타이탄'], en: 'titan' },
  { ko: ['슈퍼'], en: 'super' },

  // --- 제조사 ------------------------------------------------------------
  { ko: ['에이수스', '아수스', '아서스'], en: 'asus' },
  { ko: ['기가바이트'], en: 'gigabyte' },
  { ko: ['애즈락', '에즈락', '애즈록'], en: 'asrock' },
  { ko: ['엠에스아이'], en: 'msi' },
  { ko: ['커세어'], en: 'corsair' },
  { ko: ['쿨러마스터'], en: 'coolermaster' },
  { ko: ['써멀테이크', '서멀테이크'], en: 'thermaltake' },
  { ko: ['써멀라이트', '서멀라이트'], en: 'thermalright' },
  { ko: ['녹투아'], en: 'noctua' },
  { ko: ['딥쿨'], en: 'deepcool' },
  { ko: ['잘만'], en: 'zalman' },
  { ko: ['안텍'], en: 'antec' },
  { ko: ['시소닉', '씨소닉'], en: 'seasonic' },
  { ko: ['리안리'], en: 'lianli' },
  { ko: ['프랙탈'], en: 'fractal' },
  { ko: ['팬텍스'], en: 'phanteks' },
  { ko: ['비콰이엇'], en: 'bequiet' },
  { ko: ['사파이어'], en: 'sapphire' },
  { ko: ['파워컬러'], en: 'powercolor' },
  { ko: ['조탁', '조택'], en: 'zotac' },
  { ko: ['갤럭시'], en: 'galax' },
  { ko: ['킹스톤'], en: 'kingston' },
  { ko: ['지스킬'], en: 'gskill' },
  { ko: ['팀그룹'], en: 'teamgroup' },
  { ko: ['패트리어트'], en: 'patriot' },
  { ko: ['에이데이타', '아데이타'], en: 'adata' },
  { ko: ['실리콘파워'], en: 'siliconpower' },
  { ko: ['다크플래쉬', '다크플래시'], en: 'darkflash' },
  { ko: ['쿠거'], en: 'cougar' },
  { ko: ['에너맥스'], en: 'enermax' },
  { ko: ['아이디쿨링'], en: 'idcooling' },
  { ko: ['조스보', '존스보'], en: 'jonsbo' },
  { ko: ['아틱'], en: 'arctic' },
  { ko: ['실버스톤'], en: 'silverstone' },
  { ko: ['삼성', '삼성전자'], en: 'samsung' },
  { ko: ['하이닉스'], en: 'hynix' },
  { ko: ['마이크론'], en: 'micron' },
  { ko: ['크루셜'], en: 'crucial' },
  { ko: ['앱코'], en: 'abko' },

  // 카탈로그에 아직 없는 것. **틀린 표기가 아니라 취급 범위의 문제다.**
  // 스토리지는 적재 보류(이슈 #5)고, 마이크로닉스·이엠텍은 국내 브랜드라
  // OpenDB가 담지 않는다. 0건은 "없다"는 정직한 답이다.
  { ko: ['씨게이트', '시게이트'], en: 'seagate' },
  { ko: ['웨스턴디지털', '웨스턴디지탈'], en: 'westerndigital' },
  { ko: ['마이크로닉스'], en: 'micronics' },
  { ko: ['이엠텍'], en: 'emtek' },

  // --- 색 ----------------------------------------------------------------
  // 케이스·쿨러는 색을 같이 친다. "리안리 화이트"
  { ko: ['화이트'], en: 'white' },
  { ko: ['블랙'], en: 'black' },
];

/**
 * 「티아이」(Ti)는 **일부러 뺐다.**
 *
 * `squash` 뒤에 `ti`는 Edition·Multi·Titanium 안에도 있다. 4070 Ti를 찾으려던
 * 사람에게 `RTX 4070 EVO OC Edition`이 섞여 나온다 — 실측 151건 중 74건이
 * 4070 Ti가 아니었다. 조각이 짧을수록 부분 일치는 쓸모가 없어진다.
 */
export const OMITTED_ALIASES = ['티아이'] as const;

/** 사전 표기가 **정확히** 맞을 때만 받는다. 견적서는 타이핑 중이 아니다 */
export function lookupExact(token: string): readonly string[] {
  const hits: string[] = [];
  for (const entry of KO_ALIASES) {
    if (entry.ko.includes(token) && !hits.includes(entry.en)) hits.push(entry.en);
  }
  return hits;
}

/** 한 검색 조각. `any` 중 **하나라도** 이름에 들어있으면 이 조각은 만족이다 */
export interface Term {
  readonly raw: string;
  /** `squash`를 거친 후보들. 전부 OR */
  readonly any: readonly string[];
}

export interface SearchTerms {
  /** 전부 만족해야 한다 (AND) */
  readonly terms: readonly Term[];
  /** 한글을 영문으로 바꾼 것. 화면이 무엇으로 찾았는지 말할 때 쓴다 */
  readonly translated: readonly { readonly from: string; readonly to: string }[];
  /** 뜻을 모르는 한글 조각. **결과는 0건이 된다** — 조용히 버리면 검색이 넓어진다 */
  readonly unknown: readonly string[];
}

/**
 * 타이핑 중인 한글을 사전 항목의 앞부분으로 본다.
 *
 * "라이젠"을 치는 동안 화면에는 `라` → `라이` → `라읻`(ㅈ 입력) → `라이저` →
 * `라이젠` 이 차례로 나타난다. 앞의 것들이 전부 빗나가면 목록이 깜빡인다.
 *
 * 그래서 두 가지를 허용한다.
 * - **앞부분 일치**: `라이` ⊂ `라이젠`
 * - **마지막 음절의 받침 무시**: `라이저` 의 `저` 는 `젠` 의 받침을 뗀 것이다
 *
 * 받침을 무시하는 것은 **마지막 음절에서만** 한다. 가운데까지 풀면
 * `라이저`가 `라이젠`뿐 아니라 엉뚱한 것에도 붙는다.
 */
function matchesKey(typed: string, key: string): boolean {
  if (typed.length === 0 || typed.length > key.length) return false;
  if (key.startsWith(typed)) return true;

  const head = typed.slice(0, -1);
  if (!key.startsWith(head)) return false;

  const last = typed[typed.length - 1];
  const at = key[head.length];
  if (last === undefined || at === undefined) return false;
  // 조합 중 자모 하나(ㅈ)는 아직 음절이 아니다. 앞부분까지만 맞으면 통과시킨다.
  if (isJamo(last)) return true;
  return stripJong(last) === stripJong(at);
}

/** 타이핑 중인 한글도 받는 조회. 검색창용이다 — 견적서는 `lookupExact`를 쓴다 */
export function lookupPrefix(token: string): readonly string[] {
  const hits: string[] = [];
  for (const entry of KO_ALIASES) {
    if (entry.ko.some((key) => matchesKey(token, key)) && !hits.includes(entry.en)) {
      hits.push(entry.en);
    }
  }
  return hits;
}

/**
 * 검색어를 조각으로 나누고 한글을 영문으로 바꾼다.
 *
 * 나누는 기준은 **공백만**이다. `rtx-4070`을 하이픈에서 쪼개지 않는 이유는
 * `squash`가 어차피 하이픈을 지우기 때문이다 — 쪼개면 `4070`만으로도 걸리는
 * 조각이 생겨 오히려 넓어진다.
 */
export function searchTerms(query: string): SearchTerms {
  const terms: Term[] = [];
  const translated: { from: string; to: string }[] = [];
  const unknown: string[] = [];

  // 문자열이 아닌 것이 들어올 수 있다. Next의 `searchParams`는 `?q=a&q=b`면
  // 배열을 준다 — 그대로 `trim()`을 부르면 던지고, 호출부의 try/catch가
  // **"DB를 불러올 수 없습니다"**로 잘못 안내한다. 검색어가 없는 것으로 본다.
  const text = typeof query === 'string' ? query : '';

  for (const token of text.trim().split(/\s+/)) {
    if (token === '') continue;

    if (!hasHangul(token)) {
      const s = squash(token);
      // 기호만 친 경우다. 빈 조각을 넣으면 `like '%%'`가 되어 전부 통과한다.
      if (s !== '') terms.push({ raw: token, any: [s] });
      continue;
    }

    const hits = lookupPrefix(token);
    if (hits.length === 0) {
      unknown.push(token);
      // **버리지 않는다.** 아무것도 안 넣으면 모르는 말을 무시한 채 넓어진다.
      terms.push({ raw: token, any: [] });
      continue;
    }
    translated.push({ from: token, to: hits.join(', ') });
    terms.push({ raw: token, any: hits });
  }

  return { terms, translated, unknown };
}

/** 한 조각이라도 후보가 비었으면 어떤 부품도 만족시킬 수 없다 */
export function isImpossible(t: SearchTerms): boolean {
  return t.terms.some((term) => term.any.length === 0);
}
