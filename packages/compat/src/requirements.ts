/**
 * 규칙별 필수 스펙 필드 선언.
 *
 * **단일 진실 소스다.** 규칙 엔진이 읽는 필드와 어드민이 "채워야 할 구멍"으로 세는
 * 필드가 갈라지면, 어드민이 엉뚱한 것을 채우거나 막힌 규칙을 놓친다.
 *
 * 규칙 구현: `rules.ts` · 명세: docs/compat-rules.md
 */

import type { Severity } from './verdict';

export interface RequiredWhen {
  /** 같은 부품의 `part_specs.key` */
  readonly specKey: string;
  readonly equals: boolean | number | string;
}

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
  /**
   * **같은 부품의 다른 필드가 이 값일 때만** 필수다 (이슈 #74).
   *
   * 쿨러 높이는 공랭일 때만 규칙 9가 읽는다. 조건 없이 세면 `/rules`가 높이 결측을
   * 30.2%로 적는데, 그중 712건이 높이를 묻지 않는 수랭이었다 — 공랭만 보면 1.1%다.
   * 부품 페이지도 수랭 쿨러에 「높이를 알려주세요」라고 했다. 알려 줘도 쓰이지 않는다.
   *
   * **조건 필드가 비어 있으면 필수로 센다.** 수랭인지 모르면 높이가 필요할 수 있다.
   */
  readonly requiredWhen?: RequiredWhen;
  /**
   * 이 값이 `part_specs` 행이 아니라 **`parts` 컬럼**에 있다 (이슈 #15).
   *
   * 없으면 `part_specs.key`로 본다. `specKey`는 그대로 컬럼 이름이다.
   *
   * **선언에서 빼두면 안 된다.** 규칙이 읽는데 선언에 없으면 `/rules`가 그 결측을
   * 보여주지 못하고, 어드민도 채울 수 없다. 실제로 규칙 12가 그랬다 — 화면은
   * 결측 0.7%라고 적는데 판정 불가는 85.7%였다. 저장·집계 쪽에서 갈라 쓰는
   * 것이 화면마다 특례를 넣는 것보다 낫다.
   */
  readonly storedOnPart?: true;
  /** 이 키가 없을 때 대신 쓸 수 있는 키. 예: ppt_w ← tdp_w */
  readonly fallbackKey?: string;
  /** 어드민 입력 위젯을 고르는 데 쓴다. */
  readonly valueType: 'number' | 'string' | 'string[]' | 'boolean';
  /**
   * 받아들일 범위 (`valueType: 'number'`에만).
   *
   * **값에 대한 주장이 아니라 입력 검사다.** 범위 밖을 막는 것과 범위 안을
   * 맞다고 말하는 것은 다르다 — 여기 적힌 수는 판정에 쓰이지 않는다.
   *
   * 없으면 「0보다 큰 유한한 수」만 본다. 그것만으로는 출시 연도에
   * `999999999`가 들어가고, 규칙 12가 「메인보드(999999999년)」라고 말한다.
   */
  readonly min?: number;
  readonly max?: number;
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

/** 드라이브 규격. 규칙 17·19가 이 값으로 자리를 가른다 (docs/compat-rules.md §17.1). */
export const STORAGE_FORM_FACTORS = [
  'M.2-2280', 'M.2-2230', 'M.2-2242', 'M.2-2260', 'M.2-22110',
  '2.5\"', '3.5\"', 'PCIe', 'mSATA',
] as const;

/**
 * 받아들일 출시 연도의 위쪽 끝.
 *
 * **고정 값으로 두지 않는다.** 2026을 박아 두면 2027년에 그 해 부품을 못 넣는다.
 */
export const MAX_RELEASE_YEAR = new Date().getUTCFullYear() + 1;

// Phase 0의 8개 규칙 + Phase 1의 규칙 9·12·15~20. 규칙이 늘면 여기도 는다.
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
  // 쿨러 전력 (docs/compat-rules.md §7.2, 이슈 #30). 없으면 넣지 않고 그렇다고 적는다 — 판정은 막지 않는다
  { ruleId: 7, category: 'CPUCooler', specKey: 'water_cooled', label: '수랭 여부', severity: 'error', valueType: 'boolean', optional: true },
  { ruleId: 7, category: 'CPUCooler', specKey: 'fan_quantity', label: '팬 수', severity: 'error', valueType: 'number', optional: true, min: 0, max: 20 },
  { ruleId: 7, category: 'CPUCooler', specKey: 'fanless', label: '팬리스 설계', severity: 'error', valueType: 'boolean', optional: true },
  { ruleId: 7, category: 'CPUCooler', specKey: 'lighting', label: '조명', severity: 'error', valueType: 'string[]', optional: true },

  // 8. PCIe 보조전원 커넥터
  { ruleId: 8, category: 'GPU', specKey: 'pcie_6_pin', label: 'PCIe 6핀 개수', severity: 'error', valueType: 'number' },
  { ruleId: 8, category: 'GPU', specKey: 'pcie_8_pin', label: 'PCIe 8핀 개수', severity: 'error', valueType: 'number' },
  { ruleId: 8, category: 'GPU', specKey: 'pcie_12vhpwr', label: '12VHPWR 개수', severity: 'error', valueType: 'number' },
  { ruleId: 8, category: 'GPU', specKey: 'pcie_12v_2x6', label: '12V-2x6 개수', severity: 'error', valueType: 'number' },
  { ruleId: 8, category: 'PSU', specKey: 'pcie_6_plus_2_pin', label: 'PCIe 6+2핀 커넥터 수', severity: 'error', valueType: 'number' },
  { ruleId: 8, category: 'PSU', specKey: 'pcie_12vhpwr', label: '12VHPWR 커넥터 수', severity: 'error', valueType: 'number' },

  // 9. CPU 쿨러 높이 ≤ 케이스 최대 높이 (Phase 1, 경고 등급)
  { ruleId: 9, category: 'CPUCooler', specKey: 'water_cooled', label: '수랭 여부', severity: 'warning', valueType: 'boolean' },
  // 높이는 공랭일 때만 읽는다 (§9.2). 수랭은 높이를 묻지 않는다 — 결측으로 세지 않는다 (이슈 #74)
  { ruleId: 9, category: 'CPUCooler', specKey: 'height_mm', label: '높이', severity: 'warning', valueType: 'number', requiredWhen: { specKey: 'water_cooled', equals: false } },
  { ruleId: 9, category: 'PCCase', specKey: 'max_cpu_cooler_height_mm', label: '쿨러 최대 높이', severity: 'warning', valueType: 'number' },
  // 수랭이면 알려 주기만 한다. 판정에는 쓰지 않는다 (docs/compat-rules.md §9.2)
  { ruleId: 9, category: 'CPUCooler', specKey: 'radiator_size_mm', label: '라디에이터 크기', severity: 'warning', valueType: 'number', optional: true },

  // 12. BIOS 업데이트 필요 여부 (Phase 1)
  //
  // 출시 연도가 이 규칙의 **본체**다. bios_flashback은 경고 등급을 가르는 보조
  // 신호일 뿐이다. 연도는 parts 컬럼이라 `storedOnPart`로 표시한다 (이슈 #15) —
  // 빼두었더니 /rules가 "결측 0.7%"라고 적는데 판정 불가는 85.7%였다.
  //
  // 메인보드 연도가 진짜 병목이다: 757/3,701 (20.5%). 원본에 다른 경로가 없다
  // (docs/research/opendb-schema-analysis.md §10).
  //
  // 연도 범위는 **입력 검사**다. 1980은 x86 PC 이전이라 오타로 본다. 위쪽은
  // 내년까지 열어 둔다 — 발표만 된 부품이 카탈로그에 먼저 오르기도 한다.
  { ruleId: 12, category: 'CPU', specKey: 'release_year', label: '출시 연도', severity: 'warning', valueType: 'number', storedOnPart: true, min: 1980, max: MAX_RELEASE_YEAR },
  { ruleId: 12, category: 'Motherboard', specKey: 'release_year', label: '출시 연도', severity: 'warning', valueType: 'number', storedOnPart: true, min: 1980, max: MAX_RELEASE_YEAR },
  { ruleId: 12, category: 'Motherboard', specKey: 'bios_flashback', label: 'BIOS Flashback 지원', severity: 'warning', valueType: 'boolean' },
  // 보드 연도가 없을 때 하한을 찾는 데 쓴다 (docs/compat-rules.md §12.5)
  { ruleId: 12, category: 'Motherboard', specKey: 'socket', label: '소켓', severity: 'warning', valueType: 'string', optional: true },

  // 15. GPU 두께(슬롯) ≤ 케이스 확장 슬롯 수 (Phase 1)
  // GPU의 case_expansion_slot_width를 쓰지 않는다 — 값이 틀렸다 (docs/compat-rules.md §15.1).
  { ruleId: 15, category: 'GPU', specKey: 'total_slot_width', label: '슬롯 두께', severity: 'error', valueType: 'number' },
  { ruleId: 15, category: 'PCCase', specKey: 'expansion_slots', label: '확장 슬롯 수', severity: 'error', valueType: 'number' },

  // 16. 총 메모리 용량 ≤ 보드·CPU 최대 (Phase 1)
  // CPU 쪽은 보조다. 없어도 보드 최대만으로 판정한다 (docs/compat-rules.md §16.1).
  { ruleId: 16, category: 'RAM', specKey: 'capacity_gb', label: '용량', severity: 'warning', valueType: 'number' },
  { ruleId: 16, category: 'Motherboard', specKey: 'memory_max_gb', label: '최대 메모리', severity: 'warning', valueType: 'number' },
  { ruleId: 16, category: 'CPU', specKey: 'memory_max_gb', label: '최대 메모리', severity: 'warning', valueType: 'number', optional: true },

  // 17·18·19. 스토리지 (Phase 1)
  { ruleId: 17, category: 'Storage', specKey: 'form_factor', label: '규격', severity: 'error', valueType: 'string', options: STORAGE_FORM_FACTORS },
  { ruleId: 17, category: 'Motherboard', specKey: 'm2_slots', label: 'M.2 슬롯 수', severity: 'error', valueType: 'number' },
  // 드라이브가 하나일 때만 본다. 없으면 지금처럼 판정 불가다 (docs/compat-rules.md §17.5)
  { ruleId: 17, category: 'Storage', specKey: 'interface', label: '인터페이스', severity: 'error', valueType: 'string', optional: true },
  { ruleId: 17, category: 'Motherboard', specKey: 'm2_accepts', label: '받는 M.2 조합', severity: 'error', valueType: 'string[]', optional: true },
  // M.2 0개를 믿어도 되는지만 가른다. 둘 다 0이면 목록을 안 적은 레코드다 (docs/compat-rules.md §17.6)
  { ruleId: 17, category: 'Motherboard', specKey: 'pcie_slots', label: 'PCIe 슬롯 수', severity: 'error', valueType: 'number', optional: true },
  { ruleId: 18, category: 'Storage', specKey: 'interface', label: '인터페이스', severity: 'error', valueType: 'string' },
  { ruleId: 18, category: 'Motherboard', specKey: 'sata_ports', label: 'SATA 6Gb/s 포트 수', severity: 'error', valueType: 'number' },
  { ruleId: 18, category: 'Motherboard', specKey: 'sata_ports_3gbs', label: 'SATA 3Gb/s 포트 수', severity: 'error', valueType: 'number', optional: true },
  { ruleId: 19, category: 'PCCase', specKey: 'internal_3_5_bays', label: '3.5\" 베이 수', severity: 'error', valueType: 'number' },
  { ruleId: 19, category: 'PCCase', specKey: 'internal_2_5_bays', label: '2.5\" 베이 수', severity: 'warning', valueType: 'number' },

  // 20. 쿨러가 CPU 소켓을 지원하는가 (Phase 1, 경고 등급) — docs/compat-rules.md §20
  { ruleId: 20, category: 'CPU', specKey: 'socket', label: '소켓', severity: 'warning', valueType: 'string' },
  { ruleId: 20, category: 'CPUCooler', specKey: 'cpu_sockets', label: '지원 소켓', severity: 'warning', valueType: 'string[]' },
  // 그래픽카드는 선언하지 않는다 — 안 고른 것이 이 규칙의 입력이다 (§21)
  { ruleId: 21, category: 'CPU', specKey: 'integrated_graphics', label: '내장 그래픽', severity: 'warning', valueType: 'string' },
  // 쿨러는 선언하지 않는다 — 안 고른 것이 이 규칙의 입력이다 (§22)
  { ruleId: 22, category: 'CPU', specKey: 'includes_cooler', label: '기본 쿨러 포함', severity: 'warning', valueType: 'boolean' },
  { ruleId: 23, category: 'RAM', specKey: 'form_factor', label: '메모리 폼팩터', severity: 'warning', valueType: 'string' },
  // 보드 폼팩터는 SO-DIMM일 때 Thin Mini-ITX를 가려내는 데만 쓴다 (§23.2). 보조 입력이다 —
  // DIMM 키트는 보드 폼팩터 없이도 판정된다
  { ruleId: 23, category: 'Motherboard', specKey: 'form_factor', label: '폼팩터', severity: 'warning', valueType: 'string', optional: true },
  // 24. PSU 길이 ≤ 케이스 한계 (Phase 1, 경고) — docs/compat-rules.md §24
  { ruleId: 24, category: 'PSU', specKey: 'length_mm', label: '길이', severity: 'warning', valueType: 'number' },
  { ruleId: 24, category: 'PCCase', specKey: 'max_psu_length_mm', label: 'PSU 최대 길이', severity: 'warning', valueType: 'number' },
];

/** 이 카테고리에서 반드시 필요한 (보조 아닌) 필드들. 어드민의 구멍 계산 대상. */
export function requiredKeysFor(category: string): readonly FieldRequirement[] {
  return SPEC_REQUIREMENTS.filter((r) => r.category === category && r.optional !== true);
}

/**
 * (카테고리, 키)가 부품에 따라 필요 없을 수 있으면 그 조건 (이슈 #74).
 *
 * 선언 중 하나라도 조건 없이 필수면 `null`이다 — 그 규칙에는 언제나 필요하다.
 * 필수 선언이 없으면 `null`이다 (필수가 아니다 — `requiredKeysFor`가 가른다).
 */
export function requiredCondition(category: string, specKey: string): RequiredWhen | null {
  const reqs = SPEC_REQUIREMENTS.filter(
    (r) => r.category === category && r.specKey === specKey && r.optional !== true,
  );
  const first = reqs[0]?.requiredWhen;
  if (!first) return null;
  // 조건이 서로 다르면 어느 하나로 줄일 수 없다. 언제나 필요한 것으로 본다
  const same = reqs.every(
    (r) => r.requiredWhen?.specKey === first.specKey && r.requiredWhen.equals === first.equals,
  );
  return same ? first : null;
}

/**
 * 이 부품에서 비어 있는 필수 필드 (이슈 #74).
 *
 * `values`는 이 부품에 **있는** 키와 그 값이다. 값이 널이어도 키가 있으면 채운 것으로 센다 —
 * 결측 집계와 같은 기준이다. `requiredWhen`의 조건 필드가 비었거나 널이면 필수로 센다.
 */
export function missingRequiredFor(
  category: string,
  values: ReadonlyMap<string, unknown>,
): readonly FieldRequirement[] {
  return requiredKeysFor(category).filter((r) => {
    if (values.has(r.specKey)) return false;
    const cond = requiredCondition(category, r.specKey);
    if (!cond) return true;
    const v = values.get(cond.specKey);
    return v === undefined || v === null || v === cond.equals;
  });
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
