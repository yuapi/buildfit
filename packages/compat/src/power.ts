/**
 * 전력 계산 가정. docs/compat-rules.md §7.2
 *
 * OpenDB 메인보드 스키마에는 소비전력 필드가 없다. 그래서 CPU·GPU만 실측값을 쓰고
 * 나머지는 가정해야 하는데, **공개 자료의 편차가 커서 점 값을 고를 수 없다**
 * (메인보드 25~80W, 3배 차이).
 *
 * ADR-0004·§6.6.4의 원칙을 그대로 적용한다 — 단일 수치를 내놓지 않는다.
 * 범위로 두고 판정을 세 갈래로 낸다.
 */

export interface PowerRange {
  readonly minW: number;
  readonly maxW: number;
}

export interface PowerSource {
  readonly label: string;
  readonly url: string;
  /**
   * 1차 출처 원문을 직접 확인했는가.
   *
   * `false`면 **결과에 그대로 노출한다.** 숨기면 사용자가 검증된 수치로 오해한다.
   */
  readonly verified: boolean;
}

export interface PowerAssumptions {
  readonly motherboard: PowerRange;
  /** 메모리 모듈 1개당. */
  readonly ramPerModule: PowerRange;
  readonly source: PowerSource;
}

/**
 * ⚠ 원문 미확인.
 *
 * 이 실행 환경의 네트워크 정책이 seasonic.com을 차단해 1차 출처를 직접 읽지 못했다.
 * 검색 결과가 해당 페이지의 수치로 제시한 값이다. 경위는
 * `docs/research/power-constants.md`.
 *
 * 스토리지·쿨러·팬은 MVP 취급 부품(6종)에 없으므로 가정하지 않는다.
 */
export const POWER_ASSUMPTIONS: PowerAssumptions = {
  motherboard: { minW: 25, maxW: 80 },
  ramPerModule: { minW: 2, maxW: 5 },
  source: {
    label: 'Seasonic PSU 계산기 가이드',
    url: 'https://seasonic.com/insights/psu-calculator-using-guide-2025/',
    verified: false,
  },
};

/** 결과에 함께 내보낼 가정 설명. §7.4 */
export function describeAssumptions(a: PowerAssumptions = POWER_ASSUMPTIONS): string {
  const mark = a.source.verified ? '' : ' · 원문 미확인';
  return (
    `메인보드 ${a.motherboard.minW}~${a.motherboard.maxW}W, ` +
    `메모리 모듈당 ${a.ramPerModule.minW}~${a.ramPerModule.maxW}W로 가정 ` +
    `(${a.source.label}${mark})`
  );
}

/** PCIe 슬롯이 보조전원 없이 공급할 수 있는 전력 (W). 규칙 8의 모순 검사 기준. */
export const PCIE_SLOT_POWER_W = 75;

/** PSU 권장 정격 배수. pc-builder-spec.md §4.1. Seasonic의 여유분 20~30%와 일치한다. */
export const PSU_HEADROOM_MULTIPLIER = 1.3;

/** 케이스 GPU 최대 길이 대비 "빠듯함" 경고 임계. pc-builder-spec.md §5.1 */
export const TIGHT_FIT_RATIO = 0.95;
