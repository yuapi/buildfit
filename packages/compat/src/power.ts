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
  /** 드라이브 1개당. 원문은 상한만 준다 — 하한은 0이다 (이슈 #5) */
  readonly storagePerDrive: PowerRange;
  readonly source: PowerSource;
}

/**
 * 원문 확인 (2026-09-24). seasonic.com은 이 환경에서 여전히 막히지만 웹 아카이브의
 * 2025-07-11 사본에서 문장을 그대로 확인했다 — `docs/research/power-constants.md` §7.
 *
 * - 메인보드 "roughly 25 to 80 watts"
 * - 메모리 "about 2 to 5 watts per module"
 * - 스토리지 "you can put up to 15W, especially for some HDDs" — **상한만 준다.** 하한은
 *   지어내지 않고 0이다. 최소 합계가 낮을수록 거짓 오류가 덜 난다 (이슈 #5)
 *
 * **쿨러·팬은 아직 넣지 않는다.** 같은 원문에 범위가 있어 별도로 넣는다.
 */
export const POWER_ASSUMPTIONS: PowerAssumptions = {
  motherboard: { minW: 25, maxW: 80 },
  ramPerModule: { minW: 2, maxW: 5 },
  storagePerDrive: { minW: 0, maxW: 15 },
  source: {
    label: 'Seasonic PSU 계산기 가이드',
    url: 'https://seasonic.com/insights/psu-calculator-using-guide-2025/',
    verified: true,
  },
};

/**
 * 빠진 부품을 한 줄로. 있을 때만 부른다.
 *
 * 구간이 실제보다 **낮다**는 방향까지 말한다. "빠졌습니다"만 적으면 사용자가
 * 어느 쪽으로 틀렸는지 모른다.
 */
export function describeExcluded(excluded: readonly string[]): string | null {
  if (excluded.length === 0) return null;
  return `${excluded.join(', ')}의 소비전력은 근거 있는 범위를 구하지 못해 계산에 넣지 않았습니다. 실제 소비전력은 이 구간보다 높습니다.`;
}

/**
 * 결과에 함께 내보낼 가정 설명. §7.4
 *
 * 드라이브는 **담겼을 때만** 적는다. 없는데 「드라이브당 최대 15W」를 적으면 무엇을
 * 더했는지 헷갈린다.
 */
export function describeAssumptions(
  a: PowerAssumptions = POWER_ASSUMPTIONS,
  opts: { readonly drives?: number } = {},
): string {
  const mark = a.source.verified ? '' : ' · 원문 미확인';
  const items = [
    `메인보드 ${a.motherboard.minW}~${a.motherboard.maxW}W`,
    `메모리 모듈당 ${a.ramPerModule.minW}~${a.ramPerModule.maxW}W`,
  ];
  if ((opts.drives ?? 0) > 0) {
    const d = a.storagePerDrive;
    items.push(`드라이브당 ${d.minW > 0 ? `${d.minW}~` : '최대 '}${d.maxW}W`);
  }
  // 조사를 보간한 값 바로 뒤에 붙이지 않는다 (korean-particle.test.ts) — 「가정:」으로 연다
  return `가정: ${items.join(', ')} (${a.source.label}${mark})`;
}

/** PCIe 슬롯이 보조전원 없이 공급할 수 있는 전력 (W). 규칙 8의 모순 검사 기준. */
export const PCIE_SLOT_POWER_W = 75;

/** PSU 권장 정격 배수. pc-builder-spec.md §4.1. Seasonic의 여유분 20~30%와 일치한다. */
export const PSU_HEADROOM_MULTIPLIER = 1.3;

/** 케이스 GPU 최대 길이 대비 "빠듯함" 경고 임계. pc-builder-spec.md §5.1 */
export const TIGHT_FIT_RATIO = 0.95;

/**
 * 견적의 소비전력 추정. 규칙 7이 판정에 쓰고, 화면이 수치로 보여준다.
 *
 * **점 값을 내지 않는다.** 메인보드 소비전력은 1차 소스에 필드가 없고 공개
 * 자료도 25~80W로 3배 차이가 난다 (docs/compat-rules.md §7.1). 구간의 폭이
 * 곧 신뢰도 표시다.
 *
 * 판정과 화면이 같은 함수를 쓴다. 두 벌이 되면 "패널에는 600W인데 판정은
 * 650W 기준" 같은 어긋남이 생긴다.
 */
export interface PowerEstimate {
  /** 가정을 가장 낮게 잡았을 때 (W) */
  readonly minW: number;
  /** 가장 높게 잡았을 때 (W) */
  readonly maxW: number;
  /** 권장 PSU 정격 (W). maxW × 여유분 */
  readonly recommendedW: number;
  /** 부품별 내역. 화면이 "무엇이 얼마를 먹는가"를 보여줄 때 쓴다 */
  readonly parts: readonly { readonly label: string; readonly watts: number }[];
  /**
   * 계산에서 **빠진** 부품.
   *
   * 범위 출처가 없어 가정하지 않은 것들이다. 조용히 빼면 사용자는 합계가
   * 전부인 줄 안다 — 그러면 이 구간은 실제보다 낮다.
   */
  readonly excluded: readonly string[];
}

export function estimatePower(input: {
  cpuW: number | null;
  gpuW: number | null;
  ramModules: number;
  /** 담긴 드라이브 수. 개당 0~15W로 더한다 (이슈 #5) */
  storageCount?: number;
  assumptions?: PowerAssumptions;
}): PowerEstimate {
  const a = input.assumptions ?? POWER_ASSUMPTIONS;
  const cpuW = input.cpuW ?? 0;
  const gpuW = input.gpuW ?? 0;
  const modules = input.ramModules;
  const drives = input.storageCount ?? 0;

  const minW = Math.round(
    cpuW + gpuW + a.motherboard.minW + a.ramPerModule.minW * modules + a.storagePerDrive.minW * drives,
  );
  const maxW = Math.round(
    cpuW + gpuW + a.motherboard.maxW + a.ramPerModule.maxW * modules + a.storagePerDrive.maxW * drives,
  );

  const parts: { label: string; watts: number }[] = [];
  if (cpuW > 0) parts.push({ label: 'CPU', watts: cpuW });
  if (gpuW > 0) parts.push({ label: '그래픽카드', watts: gpuW });

  // 지금 빠지는 부품은 없다. 드라이브는 이슈 #5로 들어왔다. 자리는 남겨 둔다 —
  // 출처 없는 부품이 다시 생기면 조용히 빼지 않고 여기 적는다
  const excluded: string[] = [];

  return {
    minW,
    maxW,
    recommendedW: Math.ceil(maxW * PSU_HEADROOM_MULTIPLIER),
    parts,
    excluded,
  };
}
