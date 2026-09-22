/**
 * 여럿을 담는 칸 — 메모리와 스토리지.
 *
 * 다른 칸과 달리 **덧붙인다.** 2×16GB에 나중에 2×16GB를 더하는 것이 국내에서
 * 흔한 증설 경로이고, 규칙 3·16은 이미 여러 묶음을 합쳐서 본다. 스토리지도
 * 마찬가지로 규칙 17·18·19가 개수를 센다.
 *
 * 화면만 한 묶음이었다. 그래서 **공유 링크가 담은 두 묶음을 열어서 손대는
 * 순간 한 묶음이 조용히 사라졌다** — 공유 코드는 255개까지 담는다.
 *
 * 컴포넌트에서 떼어낸 이유는 중복·상한 규칙을 테스트로 고정하려는 것이다.
 */

/**
 * 메모리는 몇 묶음까지.
 *
 * 공유 코드는 255묶음까지 담지만 슬롯이 8개인 보드도 드물다. 주소가 길어질
 * 이유가 없으므로 현실적인 선에서 끊는다.
 */
export const MAX_RAM_KITS = 4;

/**
 * 스토리지는 몇 개까지.
 *
 * M.2 4개 + SATA 4개가 현실적인 상한이다. 보드의 M.2 슬롯 분포에서 4개 이하가
 * 대부분이고(2,983 / 3,701), 그보다 많이 담는 견적은 드물다.
 */
export const MAX_STORAGE_DRIVES = 8;

/**
 * 하나 더한다. 이미 있거나 가득 찼으면 그대로 둔다.
 *
 * 같은 것을 두 번 더하는 것은 "같은 제품을 두 개 샀다"는 뜻일 수 있지만,
 * 우리는 그것을 구분할 방법이 없다 — 같은 id가 두 번 들어가면 화면에서
 * 어느 것을 빼는지도 말할 수 없다. 더하고 싶으면 다른 것을 고른다.
 */
export function addToSlot(current: readonly string[], id: string, max: number): string[] {
  if (id === '' || current.includes(id) || current.length >= max) return [...current];
  return [...current, id];
}

/** 하나 뺀다. id를 주면 그것만, 안 주면 전부. */
export function removeFromSlot(current: readonly string[], id?: string): string[] {
  // 빈 문자열을 id로 받으면 아무것도 안 걸러져 「전부 제거」가 조용히 실패한다.
  if (id === undefined) return [];
  return current.filter((r) => r !== id);
}

/** 여럿을 담는 칸. 칸마다 상한이 다르다. */
export const MULTI_SLOT_MAX = {
  ram: MAX_RAM_KITS,
  storage: MAX_STORAGE_DRIVES,
} as const;

export type MultiSlotName = keyof typeof MULTI_SLOT_MAX;

/**
 * 타입 가드로 둔다. 단순 boolean이면 호출한 쪽에서 `sel[slot]`이
 * `string | string[]`로 남아, 잘못된 칸에 배열을 넣어도 타입이 안 잡는다.
 */
export function isMultiSlot(slot: string): slot is MultiSlotName {
  return slot in MULTI_SLOT_MAX;
}

export function maxForSlot(slot: string): number {
  return isMultiSlot(slot) ? MULTI_SLOT_MAX[slot] : 1;
}
