/** 견적 슬롯 정의. MVP 취급 부품 6종 (`pc-builder-spec.md` §3). */

export const SLOT_META = [
  { slot: 'cpu', category: 'CPU', label: 'CPU' },
  { slot: 'motherboard', category: 'Motherboard', label: '메인보드' },
  { slot: 'ram', category: 'RAM', label: '메모리' },
  { slot: 'gpu', category: 'GPU', label: '그래픽카드' },
  { slot: 'pcCase', category: 'PCCase', label: '케이스' },
  { slot: 'psu', category: 'PSU', label: '파워' },
] as const;

export type SlotName = (typeof SLOT_META)[number]['slot'];
export type CategoryName = (typeof SLOT_META)[number]['category'];

export function metaForSlot(slot: SlotName) {
  return SLOT_META.find((m) => m.slot === slot)!;
}
