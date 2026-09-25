/**
 * 스펙 키 → 사람이 읽는 이름.
 *
 * 판정에 쓰는 필드는 `@buildfit/compat`의 요구사항 선언이 이미 라벨을 갖고 있다.
 * 여기는 그 외 표시용 필드까지 덮는다. 없으면 키를 그대로 보여준다 —
 * 라벨이 없다고 값을 숨기지 않는다.
 */

import { SPEC_REQUIREMENTS } from '@buildfit/compat';

const EXTRA: Readonly<Record<string, string>> = {
  chipset: '칩셋',
  chipset_manufacturer: '칩 제조사',
  core_count: '연산 유닛 수',
  core_base_clock_mhz: '기본 클럭',
  core_boost_clock_mhz: '부스트 클럭',
  cores_total: '코어 수',
  cores_threads: '스레드 수',
  memory_bus_bit: '메모리 버스',
  effective_memory_clock: '메모리 클럭',
  memory_gb: 'VRAM',
  memory_max_gb: '최대 메모리',
  memory_channels: '메모리 채널',
  interface: '인터페이스',
  integrated_graphics: '내장 그래픽',
  includes_cooler: '번들 쿨러',
  total_slot_width: '두께 (슬롯)',
  case_expansion_slot_width: '케이스 확장 슬롯',
  cooling: '냉각 방식',
  radiator_size_mm: '라디에이터 크기',
  form_factor: '폼팩터',
  efficiency_rating: '80+ 등급',
  modular: '모듈러',
  atx_24_pin: 'ATX 24핀',
  eps_8_pin: 'EPS 8핀',
  expansion_slots: '확장 슬롯 수',
  max_psu_length_mm: '장착 가능 파워 최대 길이',
  sata_ports: 'SATA 포트 수',
  bios_flashback: 'BIOS Flashback',
  speed_mts: '속도',
  cas_latency: 'CL',
  capacity_gb: '총 용량',
  module_capacity_gb: '모듈당 용량',
  heat_spreader: '히트스프레더',
  ram_type: '메모리 규격',
  memory_type: '메모리 타입',
  cpu_sockets: '지원 소켓',
  water_cooled: '수랭',
  fan_size_mm: '팬 크기',
  m2_slots: 'M.2 슬롯 수',
  pcie_slots: 'PCIe 슬롯 수',
  m2_accepts: '받는 M.2 조합',
  sata_ports_3gbs: 'SATA 3Gb/s 포트 수',
  internal_3_5_bays: '내부 3.5" 베이',
  internal_2_5_bays: '내부 2.5" 베이',
  storage_type: '종류',
  nvme: 'NVMe',
};

const FROM_RULES: Record<string, string> = {};
for (const req of SPEC_REQUIREMENTS) FROM_RULES[req.specKey] ??= req.label;

export function specLabel(key: string): string {
  return EXTRA[key] ?? FROM_RULES[key] ?? key;
}

/**
 * `0`이 「없다」를 뜻하는 키. 원본이 공랭 부품에 라디에이터 크기 0을 적는다 — GPU 117개,
 * CPU 쿨러 23개가 전부 라디에이터가 없는 부품이다. 「0 mm」로 보이면 크기가 0인 라디에이터가
 * 있는 것처럼 읽힌다 (이슈 #69)
 */
const ZERO_MEANS_NONE: ReadonlySet<string> = new Set(['radiator_size_mm']);

/**
 * 값 표시. 배열·불리언을 사람이 읽는 형태로 바꾼다.
 *
 * `key`를 주면 키마다 다른 읽기를 쓴다(`ZERO_MEANS_NONE`). 어드민은 원래 값을 고치는 화면이라
 * 주지 않는다.
 */
export function specValueText(value: unknown, unit: string | null, key?: string): string {
  if (key !== undefined && ZERO_MEANS_NONE.has(key) && value === 0) return '없음';
  let text: string;
  if (Array.isArray(value)) text = value.join(', ');
  else if (typeof value === 'boolean') text = value ? '있음' : '없음';
  else if (value === null || value === undefined) text = '—';
  else text = String(value);
  return unit ? `${text} ${unit}` : text;
}
