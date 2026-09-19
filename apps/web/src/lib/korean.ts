/**
 * 한국어 조사 선택.
 *
 * "케이스을(를)"은 읽는 사람에게 기계가 쓴 문장으로 보인다. 이 도구의 문장은
 * 사용자가 부품을 잘못 사지 않도록 설득해야 하므로, 읽히는 문장이어야 한다.
 */

/** 마지막 글자에 받침이 있는가. 한글이 아니면 `null` — 그때는 짐작하지 않는다. */
export function hasFinalConsonant(word: string): boolean | null {
  const ch = word.trim().at(-1);
  if (ch === undefined) return null;
  const code = ch.charCodeAt(0);
  // 한글 음절 영역
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  // 숫자·영문 약어는 읽는 소리로 갈린다. 규칙으로 맞히려다 더 어색해진다.
  return null;
}

/**
 * 받침에 따라 조사를 고른다. 판단할 수 없으면 `fallback`을 쓴다.
 *
 * `fallback`의 기본값을 받침 있는 쪽으로 둔 이유는, 이 앱에서 조사가 붙는
 * 대상이 대부분 "CPU", "파워" 같은 부품 이름이고 그중 판단 불가는 영문 약어라
 * 받침 있는 쪽이 더 자주 맞기 때문이다 (CPU-을, RAM-을).
 */
export function josa(word: string, withFinal: string, withoutFinal: string): string {
  const f = hasFinalConsonant(word);
  return f === false ? withoutFinal : withFinal;
}

/** "CPU, 케이스, 파워" 처럼 잇고 마지막 항목에 맞는 조사를 붙인다. */
export function listWithJosa(
  words: readonly string[],
  withFinal: string,
  withoutFinal: string,
): string {
  const text = words.join(', ');
  return text + josa(words.at(-1) ?? '', withFinal, withoutFinal);
}
