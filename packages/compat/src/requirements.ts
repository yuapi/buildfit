/**
 * 규칙별 필수 스펙 필드 선언.
 *
 * **단일 진실 소스다.** 규칙 엔진이 읽는 필드와 어드민이 "채워야 할 구멍"으로 세는
 * 필드가 갈라지면, 어드민이 엉뚱한 것을 채우거나 막힌 규칙을 놓친다.
 *
 * 규칙 구현: `rules.ts` · 명세: docs/compat-rules.md
 */

import type { Severity } from './verdict';

export interface FieldRequirement {
  /** 이 필드가 없으면 막히는 규칙 번호 */
  readonly ruleId: number;
  /** OpenDB 디렉터리명 기준 카테고리 */
  readonly category: string;
  /** `part_specs.key` */
  readonly specKey: string;
  /** 어드민·판정 불가 사유에 보여줄 이름 */
  readonly label: string;
  /** 이 필드가 막는 규칙의 등급 */
  readonly severity: Severity;
  /**
   * 보조 필드. 없어도 규칙이 판정 불가가 되지는 않는다.
   * 예: 규칙 2의 CPU 지원 메모리 규격은 결측이면 건너뛴다 (docs/compat-rules.md §2).
   */
  readonly optional?: true;
  /** 이 키가 없을 때 대신 쓸 수 있는 키. 예: ppt_w ← tdp_w */
  readonly fallbackKey?: string;
}

export const PHASE0_REQUIREMENTS: readonly FieldRequirement[] = [
  // 1. CPU 소켓 = 메인보드 소켓
  { ruleId: 1, category: 'CPU', specKey: 'socket', label: '소켓', severity: 'error' },
  { ruleId: 1, category: 'Motherboard', specKey: 'socket', label: '소켓', severity: 'error' },

  // 2. 메모리 규격 일치
  { ruleId: 2, category: 'RAM', specKey: 'ram_type', label: '메모리 규격', severity: 'error' },
  { ruleId: 2, category: 'Motherboard', specKey: 'memory_type', label: '지원 메모리 규격', severity: 'error' },
  { ruleId: 2, category: 'CPU', specKey: 'memory_types', label: '지원 메모리 규격', severity: 'error', optional: true },

  // 3. 모듈 수 ≤ 슬롯 수
  { ruleId: 3, category: 'RAM', specKey: 'module_count', label: '모듈 개수', severity: 'error' },
  { ruleId: 3, category: 'Motherboard', specKey: 'memory_slots', label: '메모리 슬롯 수', severity: 'error' },

  // 4. GPU 길이 ≤ 케이스 최대 길이
  { ruleId: 4, category: 'GPU', specKey: 'length_mm', label: '길이', severity: 'error' },
  { ruleId: 4, category: 'PCCase', specKey: 'max_gpu_length_mm', label: '장착 가능 GPU 최대 길이', severity: 'error' },

  // 5. 보드 폼팩터 ⊂ 케이스 지원
  { ruleId: 5, category: 'Motherboard', specKey: 'form_factor', label: '폼팩터', severity: 'error' },
  { ruleId: 5, category: 'PCCase', specKey: 'supported_mobo_form_factors', label: '지원 메인보드 폼팩터', severity: 'error' },

  // 6. PSU 폼팩터 ⊂ 케이스 지원 — Phase 0의 유일한 차단 지점 (조사 §6.2)
  { ruleId: 6, category: 'PSU', specKey: 'form_factor', label: '폼팩터', severity: 'error' },
  { ruleId: 6, category: 'PCCase', specKey: 'supported_psu_form_factors', label: '지원 파워 폼팩터', severity: 'error' },

  // 7. 총 소비전력 × 1.3 ≤ PSU 정격
  { ruleId: 7, category: 'CPU', specKey: 'tdp_w', label: '소비전력(TDP)', severity: 'error' },
  { ruleId: 7, category: 'CPU', specKey: 'ppt_w', label: '실측 최대 전력(PPT)', severity: 'error', optional: true, fallbackKey: 'tdp_w' },
  { ruleId: 7, category: 'GPU', specKey: 'tdp_w', label: '소비전력(TDP)', severity: 'error' },
  { ruleId: 7, category: 'PSU', specKey: 'wattage_w', label: '정격 출력', severity: 'error' },

  // 8. PCIe 보조전원 커넥터
  { ruleId: 8, category: 'GPU', specKey: 'pcie_6_pin', label: 'PCIe 6핀 개수', severity: 'error' },
  { ruleId: 8, category: 'GPU', specKey: 'pcie_8_pin', label: 'PCIe 8핀 개수', severity: 'error' },
  { ruleId: 8, category: 'GPU', specKey: 'pcie_12vhpwr', label: '12VHPWR 개수', severity: 'error' },
  { ruleId: 8, category: 'GPU', specKey: 'pcie_12v_2x6', label: '12V-2x6 개수', severity: 'error' },
  { ruleId: 8, category: 'PSU', specKey: 'pcie_6_plus_2_pin', label: 'PCIe 6+2핀 커넥터 수', severity: 'error' },
  { ruleId: 8, category: 'PSU', specKey: 'pcie_12vhpwr', label: '12VHPWR 커넥터 수', severity: 'error' },
];

/** 이 카테고리에서 반드시 필요한 (보조 아닌) 필드들. 어드민의 구멍 계산 대상. */
export function requiredKeysFor(category: string): readonly FieldRequirement[] {
  return PHASE0_REQUIREMENTS.filter((r) => r.category === category && r.optional !== true);
}

/** 이 필드가 없으면 막히는 규칙 번호들. */
export function rulesBlockedBy(category: string, specKey: string): readonly number[] {
  return PHASE0_REQUIREMENTS.filter(
    (r) => r.category === category && r.specKey === specKey && r.optional !== true,
  ).map((r) => r.ruleId);
}

export const REQUIREMENT_CATEGORIES: readonly string[] = [
  ...new Set(PHASE0_REQUIREMENTS.map((r) => r.category)),
];
