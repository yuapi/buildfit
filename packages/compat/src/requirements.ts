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
  /** 어드민 입력 위젯을 고르는 데 쓴다. */
  readonly valueType: 'number' | 'string' | 'string[]' | 'boolean';
  /**
   * 허용값. **있으면 자유 입력을 막아야 한다.**
   * 규칙 5·6은 이 값들을 문자열 완전 일치로 비교하므로, 오타 하나가 판정을 뒤집는다.
   * 출처는 OpenDB 스키마의 enum (docs/compat-rules.md §5, §6).
   */
  readonly options?: readonly string[];
}

/** 메인보드 폼팩터. 케이스 지원 목록과 **정확히 같은 값 집합**이다 (docs/compat-rules.md §5). */
export const MOBO_FORM_FACTORS = [
  'ATX', 'Micro ATX', 'Mini-ITX', 'EATX', 'Mini DTX', 'DTX',
  'SSI EEB', 'SSI CEB', 'XL ATX', 'HPTX', 'Thin Mini-ITX', 'Flex ATX',
] as const;

/** PSU 폼팩터. 케이스 지원 목록과 **정확히 같은 값 집합**이다 (docs/compat-rules.md §6). */
export const PSU_FORM_FACTORS = [
  'ATX', 'SFX', 'SFX-L', 'TFX', 'Flex ATX', 'Mini-ITX', 'ATX/EPS',
] as const;

export const MEMORY_TYPES = ['DDR3', 'DDR4', 'DDR5', 'LPDDR4', 'LPDDR5'] as const;

// Phase 0의 8개 규칙 + Phase 1의 규칙 9·12·15. 규칙이 늘면 여기도 는다.
export const SPEC_REQUIREMENTS: readonly FieldRequirement[] = [
  // 1. CPU 소켓 = 메인보드 소켓
  { ruleId: 1, category: 'CPU', specKey: 'socket', label: '소켓', severity: 'error', valueType: 'string' },
  { ruleId: 1, category: 'Motherboard', specKey: 'socket', label: '소켓', severity: 'error', valueType: 'string' },

  // 2. 메모리 규격 일치
  { ruleId: 2, category: 'RAM', specKey: 'ram_type', label: '메모리 규격', severity: 'error', valueType: 'string', options: MEMORY_TYPES },
  { ruleId: 2, category: 'Motherboard', specKey: 'memory_type', label: '지원 메모리 규격', severity: 'error', valueType: 'string', options: MEMORY_TYPES },
  { ruleId: 2, category: 'CPU', specKey: 'memory_types', label: '지원 메모리 규격', severity: 'error', optional: true, valueType: 'string[]', options: MEMORY_TYPES },

  // 3. 모듈 수 ≤ 슬롯 수
  { ruleId: 3, category: 'RAM', specKey: 'module_count', label: '모듈 개수', severity: 'error', valueType: 'number' },
  { ruleId: 3, category: 'Motherboard', specKey: 'memory_slots', label: '메모리 슬롯 수', severity: 'error', valueType: 'number' },

  // 4. GPU 길이 ≤ 케이스 최대 길이
  { ruleId: 4, category: 'GPU', specKey: 'length_mm', label: '길이', severity: 'error', valueType: 'number' },
  { ruleId: 4, category: 'PCCase', specKey: 'max_gpu_length_mm', label: '장착 가능 GPU 최대 길이', severity: 'error', valueType: 'number' },

  // 5. 보드 폼팩터 ⊂ 케이스 지원
  { ruleId: 5, category: 'Motherboard', specKey: 'form_factor', label: '폼팩터', severity: 'error', valueType: 'string', options: MOBO_FORM_FACTORS },
  { ruleId: 5, category: 'PCCase', specKey: 'supported_mobo_form_factors', label: '지원 메인보드 폼팩터', severity: 'error', valueType: 'string[]', options: MOBO_FORM_FACTORS },

  // 6. PSU 폼팩터 ⊂ 케이스 지원 — Phase 0의 유일한 차단 지점 (조사 §6.2)
  { ruleId: 6, category: 'PSU', specKey: 'form_factor', label: '폼팩터', severity: 'error', valueType: 'string', options: PSU_FORM_FACTORS },
  { ruleId: 6, category: 'PCCase', specKey: 'supported_psu_form_factors', label: '지원 파워 폼팩터', severity: 'error', valueType: 'string[]', options: PSU_FORM_FACTORS },

  // 7. 총 소비전력 × 1.3 ≤ PSU 정격
  { ruleId: 7, category: 'CPU', specKey: 'tdp_w', label: '소비전력(TDP)', severity: 'error', valueType: 'number' },
  { ruleId: 7, category: 'CPU', specKey: 'ppt_w', label: '실측 최대 전력(PPT)', severity: 'error', optional: true, fallbackKey: 'tdp_w', valueType: 'number' },
  { ruleId: 7, category: 'GPU', specKey: 'tdp_w', label: '소비전력(TDP)', severity: 'error', valueType: 'number' },
  { ruleId: 7, category: 'PSU', specKey: 'wattage_w', label: '정격 출력', severity: 'error', valueType: 'number' },

  // 8. PCIe 보조전원 커넥터
  { ruleId: 8, category: 'GPU', specKey: 'pcie_6_pin', label: 'PCIe 6핀 개수', severity: 'error', valueType: 'number' },
  { ruleId: 8, category: 'GPU', specKey: 'pcie_8_pin', label: 'PCIe 8핀 개수', severity: 'error', valueType: 'number' },
  { ruleId: 8, category: 'GPU', specKey: 'pcie_12vhpwr', label: '12VHPWR 개수', severity: 'error', valueType: 'number' },
  { ruleId: 8, category: 'GPU', specKey: 'pcie_12v_2x6', label: '12V-2x6 개수', severity: 'error', valueType: 'number' },
  { ruleId: 8, category: 'PSU', specKey: 'pcie_6_plus_2_pin', label: 'PCIe 6+2핀 커넥터 수', severity: 'error', valueType: 'number' },
  { ruleId: 8, category: 'PSU', specKey: 'pcie_12vhpwr', label: '12VHPWR 커넥터 수', severity: 'error', valueType: 'number' },

  // 9. CPU 쿨러 높이 ≤ 케이스 최대 높이 (Phase 1, 경고 등급)
  { ruleId: 9, category: 'CPUCooler', specKey: 'water_cooled', label: '수랭 여부', severity: 'warning', valueType: 'boolean' },
  { ruleId: 9, category: 'CPUCooler', specKey: 'height_mm', label: '높이', severity: 'warning', valueType: 'number' },
  { ruleId: 9, category: 'PCCase', specKey: 'max_cpu_cooler_height_mm', label: '쿨러 최대 높이', severity: 'warning', valueType: 'number' },

  // 12. BIOS 업데이트 필요 여부 (Phase 1)
  // 출시 연도는 part_specs가 아니라 parts 컬럼이라 어드민 보강 대상이 아니다.
  // 여기 싣는 것은 bios_flashback뿐이다.
  { ruleId: 12, category: 'Motherboard', specKey: 'bios_flashback', label: 'BIOS Flashback 지원', severity: 'warning', valueType: 'boolean' },

  // 15. GPU 두께(슬롯) ≤ 케이스 확장 슬롯 수 (Phase 1)
  // GPU의 case_expansion_slot_width를 쓰지 않는다 — 값이 틀렸다 (docs/compat-rules.md §15.1).
  { ruleId: 15, category: 'GPU', specKey: 'total_slot_width', label: '슬롯 두께', severity: 'error', valueType: 'number' },
  { ruleId: 15, category: 'PCCase', specKey: 'expansion_slots', label: '확장 슬롯 수', severity: 'error', valueType: 'number' },
];

/** 이 카테고리에서 반드시 필요한 (보조 아닌) 필드들. 어드민의 구멍 계산 대상. */
export function requiredKeysFor(category: string): readonly FieldRequirement[] {
  return SPEC_REQUIREMENTS.filter((r) => r.category === category && r.optional !== true);
}

/** 이 필드가 없으면 막히는 규칙 번호들. */
export function rulesBlockedBy(category: string, specKey: string): readonly number[] {
  return SPEC_REQUIREMENTS.filter(
    (r) => r.category === category && r.specKey === specKey && r.optional !== true,
  ).map((r) => r.ruleId);
}

export const REQUIREMENT_CATEGORIES: readonly string[] = [
  ...new Set(SPEC_REQUIREMENTS.map((r) => r.category)),
];
