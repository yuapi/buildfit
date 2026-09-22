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
export type PartSlot =
  | 'cpu'
  | 'motherboard'
  | 'ram'
  | 'gpu'
  | 'pcCase'
  | 'psu'
  | 'cooler'
  | 'storage';

export const SLOT_LABELS: Readonly<Record<PartSlot, string>> = {
  cpu: 'CPU',
  motherboard: '메인보드',
  ram: '메모리',
  gpu: '그래픽카드',
  pcCase: '케이스',
  psu: '파워',
  cooler: 'CPU 쿨러',
  storage: '스토리지',
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
  15: ['gpu', 'pcCase'],
  // CPU는 없어도 된다. 보드 최대만으로도 판정한다 (rules.ts §16.1)
  16: ['ram', 'motherboard'],
  17: ['storage', 'motherboard'],
  18: ['storage', 'motherboard'],
  19: ['storage', 'pcCase'],
  20: ['cpu', 'cooler'],
};

/**
 * 규칙이 무엇을 보는지 한 줄로. 빈 화면에서 "무엇을 검사하는가"를 보여준다.
 *
 * 규칙 설명은 `docs/compat-rules.md`가 정본이고, 여기 있는 것은 그 요약이다.
 * 문장을 고칠 일이 생기면 문서를 먼저 본다.
 */
export const RULE_SUMMARY: Readonly<Record<number, string>> = {
  1: 'CPU 소켓과 메인보드 소켓이 같은가',
  2: '메모리 규격(DDR4/DDR5)이 맞는가',
  3: '메모리 모듈 수가 슬롯 수를 넘지 않는가',
  4: 'GPU가 케이스에 들어가는 길이인가',
  5: '메인보드 폼팩터를 케이스가 지원하는가',
  6: '파워 규격을 케이스가 지원하는가',
  7: '소비전력에 비해 파워 정격이 충분한가',
  8: 'GPU 보조전원 커넥터를 파워가 댈 수 있는가',
  9: 'CPU 쿨러 높이가 케이스 한계 안인가',
  12: 'CPU가 보드보다 나중에 나와 BIOS 업데이트가 필요한가',
  15: 'GPU 두께가 케이스 확장 슬롯 안에 들어가는가',
  16: '메모리 총 용량이 보드·CPU 최대 안인가',
  17: 'M.2 드라이브가 보드 슬롯 수 안인가',
  18: 'SATA 드라이브가 보드 포트 수 안인가',
  19: '3.5\"·2.5\" 드라이브가 케이스 베이 수 안인가',
  20: '쿨러가 CPU 소켓을 지원하는가',
};

function isPicked(build: Build, slot: PartSlot): boolean {
  if (slot === 'ram') return build.ram.length > 0;
  if (slot === 'storage') return build.storage.length > 0;
  return build[slot] !== null;
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
