/**
 * 전력 계산 상수. docs/compat-rules.md §7.2
 *
 * OpenDB 메인보드 스키마에는 소비전력 필드가 없다. tdp / wattage / power_draw를
 * 전부 검색해 확인했다. 따라서 CPU·GPU만 실측값을 쓰고 나머지는 상수로 가정해야 한다.
 *
 * **아직 채우지 않는다.** CLAUDE.md: 근거 없는 수치를 지어내지 않는다.
 * 임시값으로 계산해 그럴듯한 숫자를 보여주는 것이 가장 나쁘다.
 * 출처를 확보할 때까지 규칙 7은 판정 불가를 반환한다.
 */
export interface PowerConstants {
  /** 메인보드 (W). 칩셋 등급별로 나눌지 단일값으로 둘지도 확정 대상. */
  readonly motherboardW: number;
  /** 메모리 모듈 1개당 (W). DDR4/DDR5 구분 여부도 확정 대상. */
  readonly ramPerModuleW: number;
  /** 스토리지 1개당 (W). Phase 1에서 스토리지 추가 시. */
  readonly storagePerDeviceW: number;
  /** 케이스 팬 1개당 (W). */
  readonly caseFanPerUnitW: number;
}

/**
 * `[확인 필요]` 출처 있는 수치를 확보하면 채운다.
 * 채우는 순간 규칙 7이 살아나므로, 결과 화면에 가정값과 출처를 함께 노출해야 한다.
 */
export const POWER_CONSTANTS: PowerConstants | null = null;

/** PCIe 슬롯이 보조전원 없이 공급할 수 있는 전력 (W). 규칙 8의 모순 검사 기준. */
export const PCIE_SLOT_POWER_W = 75;

/** PSU 권장 정격 배수. pc-builder-spec.md §4.1 */
export const PSU_HEADROOM_MULTIPLIER = 1.3;

/** 케이스 GPU 최대 길이 대비 "빠듯함" 경고 임계. pc-builder-spec.md §5.1 */
export const TIGHT_FIT_RATIO = 0.95;
