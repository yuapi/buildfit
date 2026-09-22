/**
 * OpenDB 원본 JSON → 우리 스펙 키 매핑.
 *
 * **허용 목록 방식이다.** 전체를 통째로 밀어 넣지 않는다.
 * 여기 있는 키가 곧 규칙 엔진이 읽는 필드이므로, 매핑을 보면 무엇이 판정에 쓰이는지
 * 알 수 있어야 한다. 대응 근거: docs/compat-rules.md
 *
 * 키 추가는 add-only라 안전하다 (autonomous-pipeline-plan.md §7.1).
 */

export interface SpecMap {
  /** 우리 스펙 키 → OpenDB JSON 경로 (점 표기) */
  readonly [specKey: string]: string;
}

export const CATEGORY_SPECS: Readonly<Record<string, SpecMap>> = {
  CPU: {
    socket: 'socket',
    tdp_w: 'specifications.tdp',
    ppt_w: 'specifications.ppt',
    memory_types: 'specifications.memory.types',
    memory_channels: 'specifications.memory.channels',
    memory_max_gb: 'specifications.memory.maxSupport',
    includes_cooler: 'specifications.includesCooler',
    integrated_graphics: 'specifications.integratedGraphics.model',
    cores_total: 'cores.total',
    cores_threads: 'cores.threads',
  },
  Motherboard: {
    socket: 'socket',
    form_factor: 'form_factor',
    chipset: 'chipset',
    memory_type: 'memory.ram_type',
    memory_slots: 'memory.slots',
    memory_max_gb: 'memory.max',
    // 규칙 12의 경고 심각도를 나누는 신호. 99% 충전 (조사 §7.4)
    bios_flashback: 'bios_features.flashback',
    sata_ports: 'storage_devices.sata_6_gb_s',
    // 3Gb/s 포트도 드라이브가 꽂히는 자리다. 합산은 규칙 18이 한다 —
    // 원본이 말한 대로 담고 판정은 엔진에서 (docs/compat-rules.md §18).
    sata_ports_3gbs: 'storage_devices.sata_3_gb_s',
  },
  RAM: {
    ram_type: 'ram_type',
    speed_mts: 'speed',
    cas_latency: 'cas_latency',
    module_count: 'modules.quantity',
    module_capacity_gb: 'modules.capacity_gb',
    capacity_gb: 'capacity',
    // DDR5 기준 74.8% 결측. Phase 1 규칙 11이 여기 걸린다 (조사 §6.1)
    height_mm: 'height',
    heat_spreader: 'heat_spreader',
    form_factor: 'form_factor',
  },
  GPU: {
    chipset: 'chipset',
    chipset_manufacturer: 'chipset_manufacturer',

    // --- 물리 (호환성 판정) ---
    // 현행 세대 AIB 1,344개 전량 보유 (조사 §4)
    length_mm: 'length',
    total_slot_width: 'total_slot_width',
    case_expansion_slot_width: 'case_expansion_slot_width',
    cooling: 'cooling',
    radiator_size_mm: 'radiator_size',

    // --- 전력 ---
    tdp_w: 'tdp',
    pcie_6_pin: 'power_connectors.pcie_6_pin',
    pcie_8_pin: 'power_connectors.pcie_8_pin',
    pcie_12vhpwr: 'power_connectors.pcie_12VHPWR',
    pcie_12v_2x6: 'power_connectors.pcie_12V_2x6',

    // --- 성능 (Phase 3 §6.6.1) ---
    // 같은 칩이라도 AIB 모델마다 다르다. RTX 4090 부스트 클럭이 2235~2670MHz로
    // 435MHz(약 19%) 벌어진다. OC 에디션을 구분하는 것이 이 필드다.
    // §6.6.1의 g(연산 유닛, 클럭, 메모리 대역폭, VRAM, 해상도)에 대응한다.
    core_count: 'core_count',
    core_base_clock_mhz: 'core_base_clock',
    core_boost_clock_mhz: 'core_boost_clock',
    memory_gb: 'memory',
    memory_type: 'memory_type',
    memory_bus_bit: 'memory_bus',
    effective_memory_clock: 'effective_memory_clock',
    interface: 'interface',
  },
  PCCase: {
    form_factor: 'form_factor',
    supported_mobo_form_factors: 'supported_motherboard_form_factors',
    // 현행 세대 83.2% 결측. 규칙 6이 여기 걸린다 (조사 §6.1)
    supported_psu_form_factors: 'supported_power_supply_form_factors',
    max_gpu_length_mm: 'max_video_card_length',
    max_cpu_cooler_height_mm: 'max_cpu_cooler_height',
    max_psu_length_mm: 'max_psu_length',
    expansion_slots: 'expansion_slots',
    // 규칙 19. 3.5"는 99.4%, 2.5"는 99.4% 채워져 있다
    internal_3_5_bays: 'internal_3_5_bays',
    internal_2_5_bays: 'internal_2_5_bays',
    // 라디에이터 장착 필드는 OpenDB에 없다 (조사 §7.2). 수동 보강 대상
  },
  PSU: {
    wattage_w: 'wattage',
    form_factor: 'form_factor',
    efficiency_rating: 'efficiency_rating',
    length_mm: 'length',
    modular: 'modular',
    pcie_6_plus_2_pin: 'connectors.pcie_6_plus_2_pin',
    pcie_12vhpwr: 'connectors.pcie_12vhpwr',
    eps_8_pin: 'connectors.eps_8_pin',
    atx_24_pin: 'connectors.atx_24_pin',
  },
  Storage: {
    capacity_gb: 'capacity',
    storage_type: 'storage_type',
    // 규칙 17·19가 본다. M.2-2280 / 2.5" / 3.5" 같은 값이다
    form_factor: 'form_factor',
    interface: 'interface',
    nvme: 'nvme',
  },
  CPUCooler: {
    height_mm: 'height',
    cpu_sockets: 'cpu_sockets',
    water_cooled: 'water_cooled',
    radiator_size_mm: 'radiator_size',
    fan_size_mm: 'fan_size',
  },
};

/**
 * 경로 하나로 안 되는 스펙.
 *
 * `CATEGORY_SPECS`와 같은 허용 목록이지만 원본 모양이 그대로 쓸 수 없는 경우다.
 * **여기도 보면 무엇이 판정에 쓰이는지 알 수 있어야 한다** — 계산은 짧게 두고
 * 판단은 규칙 엔진에 남긴다.
 */
export const DERIVED_SPECS: Readonly<
  Record<string, Readonly<Record<string, (record: Record<string, unknown>) => unknown>>>
> = {
  Motherboard: {
    /**
     * M.2 슬롯 **개수**. 원본은 슬롯마다 크기·키·인터페이스를 담은 배열이다.
     *
     * 개수만 담는다. 규칙 17이 개수를 보고, 어드민에서 사람이 스펙시트를 보고
     * 채울 수 있는 모양이기도 하다. 크기 맞춤(2280 드라이브 ↔ 2242 전용 슬롯)은
     * 원본의 크기 표기가 「2242/2260/2280」·「2280-22110」처럼 제각각이라
     * 별도 조사가 필요하다 (docs/compat-rules.md §17.3).
     */
    m2_slots: (r) => (Array.isArray(r['m2_slots']) ? r['m2_slots'].length : undefined),
  },
};

/**
 * 0이 "값 없음"을 뜻하는 키.
 *
 * 개별적으로 물리적 불가능한 값은 적재 단계에서 버린다 — 코어 0개, 클럭 0MHz,
 * 메모리 버스 0bit인 그래픽카드는 없다. `metadata.releaseYear`의 `20117`을 버리는
 * 것과 같은 처리다 (docs/compat-rules.md §0.2 '범위 밖').
 *
 * **보조전원 커넥터는 여기 들어가지 않는다.** 커넥터 0개는 실제로 가능한 값이고
 * (TDP 75W 이하 카드), 0이 잘못된 경우는 TDP와 함께 봐야 알 수 있는 **조합 모순**이라
 * 규칙 엔진이 판정한다 (docs/compat-rules.md §8.4). 두 경우를 구분한다.
 *
 * - 개별적으로 불가능 → 적재 시 버린다 (여기)
 * - 조합으로 모순     → 저장하고 규칙 엔진이 판정 불가를 낸다
 */
export const POSITIVE_ONLY_KEYS: ReadonlySet<string> = new Set([
  'core_count',
  // 0슬롯을 차지하는 그래픽카드는 없다. 미입력을 0으로 채운 값이다.
  'total_slot_width',
  'case_expansion_slot_width',
  'core_base_clock_mhz',
  'core_boost_clock_mhz',
  'memory_bus_bit',
  'effective_memory_clock',
  'length_mm',
  'tdp_w',
  'wattage_w',
  'memory_gb',
  'memory_slots',
  'height_mm',
  'max_gpu_length_mm',
  'max_cpu_cooler_height_mm',
  'max_psu_length_mm',
  'speed_mts',
  'module_count',
  // 0GB 드라이브·0GB 킷은 없다. m2_slots와 sata_ports는 여기 넣지 않는다 —
  // M.2가 없는 보드는 실재한다 (DDR3의 86.3%, DDR2의 100%).
  'capacity_gb',
]);

/** 단위. 없는 키는 단위가 없는 값이다. */
export const SPEC_UNITS: Readonly<Record<string, string>> = {
  tdp_w: 'W',
  ppt_w: 'W',
  wattage_w: 'W',
  length_mm: 'mm',
  height_mm: 'mm',
  max_gpu_length_mm: 'mm',
  max_cpu_cooler_height_mm: 'mm',
  max_psu_length_mm: 'mm',
  radiator_size_mm: 'mm',
  fan_size_mm: 'mm',
  memory_gb: 'GB',
  capacity_gb: 'GB',
  module_capacity_gb: 'GB',
  memory_max_gb: 'GB',
  speed_mts: 'MT/s',
  core_base_clock_mhz: 'MHz',
  core_boost_clock_mhz: 'MHz',
  memory_bus_bit: 'bit',
};

export const CATEGORIES = Object.keys(CATEGORY_SPECS);
