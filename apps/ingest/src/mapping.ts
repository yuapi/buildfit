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
    // 현행 세대 AIB 1,344개 전량 보유 (조사 §4)
    length_mm: 'length',
    total_slot_width: 'total_slot_width',
    tdp_w: 'tdp',
    memory_gb: 'memory',
    memory_type: 'memory_type',
    pcie_6_pin: 'power_connectors.pcie_6_pin',
    pcie_8_pin: 'power_connectors.pcie_8_pin',
    pcie_12vhpwr: 'power_connectors.pcie_12VHPWR',
    pcie_12v_2x6: 'power_connectors.pcie_12V_2x6',
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
  CPUCooler: {
    height_mm: 'height',
    cpu_sockets: 'cpu_sockets',
    water_cooled: 'water_cooled',
    radiator_size_mm: 'radiator_size',
    fan_size_mm: 'fan_size',
  },
};

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
};

export const CATEGORIES = Object.keys(CATEGORY_SPECS);
