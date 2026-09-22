/**
 * 견적 슬롯 정의. MVP 6종 (`pc-builder-spec.md` §3) + Phase 1의 CPU 쿨러·스토리지.
 *
 * 순서가 화면 순서다. 쿨러와 스토리지는 CPU·메모리 바로 뒤가 아니라 마지막에
 * 둔다 — 필수 부품 여섯 개를 먼저 고르는 흐름을 끊지 않는다.
 */

export const SLOT_META = [
  { slot: 'cpu', category: 'CPU', label: 'CPU' },
  { slot: 'motherboard', category: 'Motherboard', label: '메인보드' },
  { slot: 'ram', category: 'RAM', label: '메모리' },
  { slot: 'gpu', category: 'GPU', label: '그래픽카드' },
  { slot: 'pcCase', category: 'PCCase', label: '케이스' },
  { slot: 'psu', category: 'PSU', label: '파워' },
  { slot: 'cooler', category: 'CPUCooler', label: 'CPU 쿨러' },
  { slot: 'storage', category: 'Storage', label: '스토리지' },
] as const;

export type SlotName = (typeof SLOT_META)[number]['slot'];
export type CategoryName = (typeof SLOT_META)[number]['category'];

export function metaForSlot(slot: SlotName) {
  return SLOT_META.find((m) => m.slot === slot)!;
}

/**
 * 표시용 카테고리 이름. MVP 6종 외에 Phase 1 대상까지 덮는다.
 *
 * `GPUChip`은 없다. 적재가 chipset으로 유도해 만든 내부 레코드라 스펙이 없고,
 * 주소를 주면 §8이 경계한 저품질 페이지가 된다. 목록·sitemap에서 제외한다.
 */
export const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  CPU: 'CPU',
  Motherboard: '메인보드',
  RAM: '메모리',
  GPU: '그래픽카드',
  PCCase: '케이스',
  PSU: '파워',
  CPUCooler: 'CPU 쿨러',
  Storage: '스토리지',
};

/** 공개 색인 대상 카테고리. */
export const INDEXED_CATEGORIES = Object.keys(CATEGORY_LABELS);

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

/** URL 조각 → DB 카테고리. 주소는 소문자로 쓴다. */
export function categoryFromSlug(urlPart: string): string | null {
  const found = INDEXED_CATEGORIES.find((c) => c.toLowerCase() === urlPart.toLowerCase());
  return found ?? null;
}
