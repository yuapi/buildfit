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

import type { CpuCooler } from './parts';

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
  /** 수랭(AIO) 쿨러 하나 (이슈 #30) */
  readonly aioCooler: PowerRange;
  /** 공랭 쿨러 팬 1개. 조명이 없다고 확실할 때 */
  readonly fanPlain: PowerRange;
  /** 공랭 쿨러 팬 1개. 조명이 있거나 모를 때 — 넓은 쪽 */
  readonly fanLit: PowerRange;
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
 * - 수랭 "15–30 W", 팬 "1–3 W each, with backlighting – up to 6 W" (이슈 #30)
 */
export const POWER_ASSUMPTIONS: PowerAssumptions = {
  motherboard: { minW: 25, maxW: 80 },
  ramPerModule: { minW: 2, maxW: 5 },
  storagePerDrive: { minW: 0, maxW: 15 },
  // "Water cooling (AIO) can draw 15–30 W"
  aioCooler: { minW: 15, maxW: 30 },
  // "Conventional fans consume 1–3 W each, with backlighting – up to 6 W"
  fanPlain: { minW: 1, maxW: 3 },
  fanLit: { minW: 1, maxW: 6 },
  source: {
    label: 'Seasonic PSU 계산기 가이드',
    url: 'https://seasonic.com/insights/psu-calculator-using-guide-2025/',
    verified: true,
  },
};

/**
 * CPU 쿨러의 전력 범위 — docs/compat-rules.md §7.2 (이슈 #30).
 *
 * 모르면 `null`이다. **팬 수를 지어내지 않는다** — 원본의 86%가 비어 있어도 「공랭은
 * 보통 한두 개」 같은 수를 넣지 않는다. 호출하는 쪽이 「넣지 않았다」고 적는다.
 */
export function coolerPower(
  cooler: CpuCooler,
  a: PowerAssumptions = POWER_ASSUMPTIONS,
): { readonly range: PowerRange; readonly label: string } | null {
  if (cooler.waterCooled === true) return { range: a.aioCooler, label: '수랭 쿨러' };
  if (cooler.waterCooled !== false) return null;
  if (cooler.fanless === true || cooler.fanQuantity === 0) {
    return { range: { minW: 0, maxW: 0 }, label: '팬 없는 쿨러' };
  }
  const n = cooler.fanQuantity;
  if (n === null || !Number.isFinite(n) || n < 0) return null;
  // 조명이 없다고 확실할 때만 좁힌다. 빈 목록은 담기지 않아 null이다 — 모르면 넓은 쪽
  const plain = cooler.lighting?.length === 1 && cooler.lighting[0] === 'None';
  const per = plain ? a.fanPlain : a.fanLit;
  return { range: { minW: per.minW * n, maxW: per.maxW * n }, label: `쿨러 팬 ${n}개` };
}

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
  opts: { readonly drives?: number; readonly cooler?: CpuCooler | null } = {},
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
  const cooled = opts.cooler ? coolerPower(opts.cooler, a) : null;
  if (cooled && cooled.range.maxW > 0) {
    items.push(`${cooled.label} ${cooled.range.minW}~${cooled.range.maxW}W`);
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
  /** 고른 CPU 쿨러. 전력을 모르면 넣지 않고 `excluded`에 적는다 (이슈 #30) */
  cooler?: CpuCooler | null;
  assumptions?: PowerAssumptions;
}): PowerEstimate {
  const a = input.assumptions ?? POWER_ASSUMPTIONS;
  const cpuW = input.cpuW ?? 0;
  const gpuW = input.gpuW ?? 0;
  const modules = input.ramModules;
  const drives = input.storageCount ?? 0;

  const cooled = input.cooler ? coolerPower(input.cooler, a) : null;
  const coolerMin = cooled?.range.minW ?? 0;
  const coolerMax = cooled?.range.maxW ?? 0;

  const minW = Math.round(
    cpuW + gpuW + a.motherboard.minW + a.ramPerModule.minW * modules + a.storagePerDrive.minW * drives + coolerMin,
  );
  const maxW = Math.round(
    cpuW + gpuW + a.motherboard.maxW + a.ramPerModule.maxW * modules + a.storagePerDrive.maxW * drives + coolerMax,
  );

  const parts: { label: string; watts: number }[] = [];
  if (cpuW > 0) parts.push({ label: 'CPU', watts: cpuW });
  if (gpuW > 0) parts.push({ label: '그래픽카드', watts: gpuW });

  // 쿨러를 골랐는데 전력을 모르면(공랭 팬 수를 모름 등) 조용히 빼지 않고 적는다
  const excluded: string[] = input.cooler && !cooled ? ['CPU 쿨러 팬(개수를 모름)'] : [];

  return {
    minW,
    maxW,
    recommendedW: Math.ceil(maxW * PSU_HEADROOM_MULTIPLIER),
    parts,
    excluded,
  };
}
