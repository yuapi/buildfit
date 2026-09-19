/**
 * 규칙마다 어떤 부품이 있어야 판정할 수 있는가.
 *
 * 엔진은 미선택과 결측을 이미 구분한다 — 미선택이면 규칙이 결과에서 빠지고,
 * 결측이면 `unknown`으로 남는다. 그런데 **결과에서 빠진 규칙은 화면에서도
 * 사라져서**, CPU와 보드만 고른 사용자가 "검사 4개 통과"를 보고 견적이
 * 확인됐다고 오해한다. 이 도구가 낼 수 있는 가장 나쁜 결과다 (명세 §4.3).
 *
 * 그래서 무엇 때문에 무엇을 못 봤는지 말할 수 있어야 한다.
 * `rules.ts`의 `if (!x || !y) return null` 조건을 선언으로 옮겨 적은 것이고,
 * 둘이 어긋나지 않는지는 테스트가 지킨다 (`test/applicability.test.ts`).
 */

import type { Build } from './parts';

/** `Build`에서 부품 하나를 가리키는 키. */
export type PartSlot = 'cpu' | 'motherboard' | 'ram' | 'gpu' | 'pcCase' | 'psu' | 'cooler';

export const SLOT_LABELS: Readonly<Record<PartSlot, string>> = {
  cpu: 'CPU',
  motherboard: '메인보드',
  ram: '메모리',
  gpu: '그래픽카드',
  pcCase: '케이스',
  psu: '파워',
  cooler: 'CPU 쿨러',
};

/** 규칙 번호 → 그 규칙이 판정하려면 있어야 하는 부품들. */
export const RULE_PARTS: Readonly<Record<number, readonly PartSlot[]>> = {
  1: ['cpu', 'motherboard'],
  2: ['ram', 'motherboard'],
  3: ['ram', 'motherboard'],
  4: ['gpu', 'pcCase'],
  5: ['motherboard', 'pcCase'],
  6: ['psu', 'pcCase'],
  // GPU는 없어도 된다. 안 골랐으면 내장그래픽 구성으로 본다 (rules.ts §7)
  7: ['cpu', 'psu'],
  8: ['gpu', 'psu'],
  9: ['cooler', 'pcCase'],
  12: ['cpu', 'motherboard'],
};

function isPicked(build: Build, slot: PartSlot): boolean {
  return slot === 'ram' ? build.ram.length > 0 : build[slot] !== null;
}

export interface NotApplicable {
  readonly ruleId: number;
  /** 아직 고르지 않아 막힌 부품들. */
  readonly needs: readonly PartSlot[];
}

/**
 * 아직 고르지 않은 부품 때문에 돌지 못한 규칙들.
 *
 * **결측과 다르다.** 결측은 부품은 골랐는데 데이터가 없는 것이고, 이쪽은
 * 아직 고르지 않은 것이다. 사용자가 할 일이 다르다 — 하나는 부품을 고르는
 * 것이고 하나는 스펙을 제보하거나 제조사 페이지를 확인하는 것이다.
 */
export function notApplicable(
  build: Build,
  ruleIds: readonly number[] = Object.keys(RULE_PARTS).map(Number),
): NotApplicable[] {
  const out: NotApplicable[] = [];
  for (const ruleId of ruleIds) {
    const needs = (RULE_PARTS[ruleId] ?? []).filter((slot) => !isPicked(build, slot));
    if (needs.length > 0) out.push({ ruleId, needs });
  }
  return out.sort((a, b) => a.ruleId - b.ruleId);
}

/** 아직 고르지 않은 부품 목록. 규칙을 막고 있는 것만 모은다. */
export function blockingSlots(build: Build): PartSlot[] {
  const slots = new Set<PartSlot>();
  for (const na of notApplicable(build)) for (const s of na.needs) slots.add(s);
  return [...slots];
}
