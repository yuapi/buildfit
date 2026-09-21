/**
 * 메모리 묶음 고르기.
 *
 * 다른 칸과 달리 **덧붙인다.** 2×16GB에 나중에 2×16GB를 더하는 것이 국내에서
 * 흔한 증설 경로이고, 규칙 3은 이미 여러 묶음의 모듈 수를 합쳐서 본다.
 *
 * 화면만 한 묶음이었다. 그래서 **공유 링크가 담은 두 묶음을 열어서 손대는
 * 순간 한 묶음이 조용히 사라졌다** — 공유 코드는 255묶음까지 담는다.
 *
 * 컴포넌트에서 떼어낸 이유는 중복·상한 규칙을 테스트로 고정하려는 것이다.
 */

/**
 * 몇 묶음까지 담을까.
 *
 * 공유 코드는 255묶음까지 담지만 슬롯이 8개인 보드도 드물다. 주소가 길어질
 * 이유가 없으므로 현실적인 선에서 끊는다.
 */
export const MAX_RAM_KITS = 4;

/**
 * 묶음을 더한다. 이미 있거나 가득 찼으면 그대로 둔다.
 *
 * 같은 묶음을 두 번 더하는 것은 "같은 제품을 두 개 샀다"는 뜻일 수 있지만,
 * 우리는 그것을 구분할 방법이 없다 — 같은 id가 두 번 들어가면 화면에서
 * 어느 것을 빼는지도 말할 수 없다. 더하고 싶으면 다른 묶음을 고른다.
 */
export function addRamKit(current: readonly string[], id: string): string[] {
  if (id === '' || current.includes(id) || current.length >= MAX_RAM_KITS) return [...current];
  return [...current, id];
}

/** 묶음을 뺀다. id를 주면 그것만, 안 주면 전부. */
export function removeRamKit(current: readonly string[], id?: string): string[] {
  // 빈 문자열을 id로 받으면 아무것도 안 걸러져 「전부 제거」가 조용히 실패한다.
  if (id === undefined) return [];
  return current.filter((r) => r !== id);
}
