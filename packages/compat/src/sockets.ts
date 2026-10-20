/**
 * 같은 소켓을 다르게 적은 표기 — 이슈 #16, docs/compat-rules.md §1.1.
 *
 * 원본은 CPU와 메인보드가 **같은 enum 값 집합**을 공유하지만, 그 집합 안에 같은
 * 소켓의 두 표기가 함께 들어 있고 양쪽이 서로 다른 것을 골랐다. Threadripper
 * 1000/2000은 전부 `sTR4`, X399 보드는 전부 `TR4`다. 문자열로 비교하면 230조합이
 * 전부 「장착되지 않습니다」였다.
 *
 * **규칙 1과 고르기 제약이 이 표 하나를 쓴다.** 둘이 갈라지면 "고를 땐 나오는데
 * 판정은 오류"가 된다 (ADR-0010).
 *
 * ## 넣는 기준
 *
 * **거짓 통과가 이 도구의 가장 나쁜 결과다.** 그래서 핀 배열이 같다는 것만으로는
 * 넣지 않는다 — 칩셋이나 세대가 받는 CPU를 가르면 묶는 순간 거짓 통과가 된다.
 * 양쪽 부품을 전수로 확인해 **그 표기를 쓰는 모든 부품이 서로를 받는다**는 것이
 * 보일 때만 넣는다.
 *
 * 넣지 않은 것과 이유는 compat-rules §1.1의 표에 있다 (`LGA 2011-3 Narrow`,
 * `2 x …`, `LGA 1151v2`). 그 쌍은 **오류로 남는다** — 과하게 막는 것이 거짓으로
 * 통과시키는 것보다 낫다.
 */

/**
 * 등가 묶음. 한 묶음 안의 표기는 전부 같은 소켓이다.
 *
 * 근거를 묶음마다 적는다. 근거 없는 줄은 넣지 않는다.
 */
const SOCKET_GROUPS: readonly (readonly string[])[] = [
  // AMD 공식 명칭은 sTR4, 흔히 TR4. 원본에서 TR4 보드 23개가 전부 X399이고
  // sTR4 CPU 10개가 전부 X399용(Threadripper 1900X ~ 2990WX)이다 (2026-09-22 전수).
  ['sTR4', 'TR4'],
];

const GROUP_OF = new Map<string, readonly string[]>();
for (const group of SOCKET_GROUPS) {
  for (const name of group) GROUP_OF.set(name, group);
}

/**
 * 이 소켓과 같은 소켓의 모든 표기 (자기 자신 포함).
 *
 * 표에 없는 소켓은 자기 자신 하나만 돌려준다 — 모르는 것을 묶지 않는다.
 */
export function socketAliases(socket: string): readonly string[] {
  return GROUP_OF.get(socket) ?? [socket];
}

/** 두 소켓 표기가 같은 소켓인가. */
export function sameSocket(a: string, b: string): boolean {
  return a === b || socketAliases(a).includes(b);
}

/**
 * (표기, 대표 표기) 쌍 전부. 묶음의 첫 표기가 대표다.
 *
 * DB 쪽이 SQL 안에서 같은 비교를 해야 할 때 쓴다 — 중복 레코드 간 불일치 검사가
 * `TR4`와 `sTR4`를 「값이 어긋난다」로 세면, 같은 소켓인데 「검증 중」이 붙는다
 * (이슈 #16 뒷정리). 표를 SQL에 따로 적지 않고 여기서 받아 간다.
 */
export function socketCanonicalPairs(): readonly (readonly [string, string])[] {
  return SOCKET_GROUPS.flatMap((group) => group.map((name) => [name, group[0]!] as const));
}

/**
 * 쿨러 목록의 표기 하나가 이 CPU 소켓을 덮는가 — 규칙 20, compat-rules §20.2.
 *
 * CPU↔보드 등가(`sameSocket`)에 **쿨러에만 맞는 보정 하나**를 더한다.
 *
 * `LGA 115`는 `LGA 115x`가 잘린 표기다 — 11개 중 10개가 1150·1151을 따로 적지
 * 않았고, 한 제품은 이름에 「LGA 775/ 115x/ 1366」이라고 적혀 있다. `115x`는
 * **쿨러 고정 구멍 간격이 같다**는 뜻이다.
 *
 * ★ **이 보정을 `SOCKET_GROUPS`에 넣지 않는다.** LGA 1150 CPU는 LGA 1151 보드에
 * 안 들어간다. 거기 넣으면 규칙 1이 거짓 통과한다 — 테스트가 그 누출을 막는다.
 *
 * `LGA 1200`은 넣지 않는다. 고정 구멍이 같다고 알려져 있지만 **표기가 115x를
 * 뜻하지 않는다.** 잘린 문자열을 푸는 것과 호환 관계를 더하는 것은 다른 일이다.
 */
const COOLER_FAMILY: Readonly<Record<string, readonly string[]>> = {
  'LGA 115': ['LGA 1150', 'LGA 1151', 'LGA 1155', 'LGA 1156'],
};

/**
 * 소켓을 만든 회사가 밝힌 **쿨러 장착 호환** — 규칙 20, compat-rules §20.3.
 *
 * 표기 보정(`COOLER_FAMILY`)과 다르다. 이것은 호환 관계이고, 그래서 **공식 문서가
 * 있는 것만** 넣는다. 한 방향이다 — 문서가 말한 쪽만 적는다.
 *
 * ★ `SOCKET_GROUPS`에 넣지 않는다. LGA 1700 CPU는 LGA 1851 보드에 안 들어간다.
 */
export const COOLER_MOUNT_COMPAT: Readonly<Record<string, { readonly from: string; readonly source: string }>> = {
  // "existing thermal solutions designed for LGA1700 can fit on LGA1851 without modification"
  'LGA 1851': {
    from: 'LGA 1700',
    source: 'https://www.intel.com/content/www/us/en/support/articles/000099700/processors.html',
  },
};

/** 이 CPU 소켓에 공식 문서로 장착이 확인된 앞 세대 표기가 쿨러 목록에 있는가 */
export function coolerMountCompat(listed: readonly string[], cpuSocket: string) {
  const compat = COOLER_MOUNT_COMPAT[cpuSocket];
  return compat && listed.some((entry) => sameSocket(entry, compat.from)) ? compat : null;
}

export function coolerListCovers(listed: readonly string[], cpuSocket: string): boolean {
  return listed.some(
    (entry) => sameSocket(entry, cpuSocket) || (COOLER_FAMILY[entry]?.includes(cpuSocket) ?? false),
  );
}
