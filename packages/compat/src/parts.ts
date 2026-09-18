/**
 * 판정에 쓰는 부품 타입.
 *
 * OpenDB 스키마를 우리 도메인으로 정규화한 형태다. 적재 스크립트(이슈 #3)가
 * 이 모양으로 채운다. 필드 경로 대응은 docs/compat-rules.md 참조.
 *
 * **`null`은 결측을 뜻한다.** 0으로 대체하지 않는다 — OpenDB에는 미입력을 0으로
 * 채운 레코드가 실재하고, 그것이 거짓 통과를 만든다 (docs/compat-rules.md §8.4).
 */

export interface PartRef {
  readonly id: string;
  /** 사용자에게 보여줄 이름. 판정 불가 사유에 그대로 실린다. */
  readonly name: string;
}

export interface Cpu extends PartRef {
  readonly socket: string | null;
  /** 정격 TDP (W). */
  readonly tdp: number | null;
  /** 실측 최대 (W). 있으면 이쪽을 우선한다. docs/compat-rules.md §7.1 */
  readonly ppt: number | null;
  /** 지원 메모리 규격. 보조 검사용이라 결측이어도 규칙 2를 막지 않는다. */
  readonly memoryTypes: readonly string[] | null;
}

export interface Motherboard extends PartRef {
  readonly socket: string | null;
  readonly formFactor: string | null;
  readonly memoryType: string | null;
  readonly memorySlots: number | null;
}

/** 메모리는 키트 단위로 선택한다. 여러 키트를 담을 수 있다. */
export interface RamKit extends PartRef {
  readonly ramType: string | null;
  /** 이 키트에 든 모듈 개수. */
  readonly moduleCount: number | null;
  readonly heightMm: number | null;
}

/** GPU 보조전원 커넥터. GPU는 12VHPWR과 12V-2x6을 나눠 센다. */
export interface GpuConnectors {
  readonly pcie6: number | null;
  readonly pcie8: number | null;
  readonly pcie12vhpwr: number | null;
  readonly pcie12v2x6: number | null;
}

export interface Gpu extends PartRef {
  readonly chipset: string | null;
  readonly lengthMm: number | null;
  readonly tdp: number | null;
  readonly connectors: GpuConnectors;
  /**
   * 사용자가 AIB 모델을 지정하지 않고 칩만 고른 경우 true.
   * 길이를 단정하지 않는다. docs/compat-rules.md §4.1
   */
  readonly chipOnly?: boolean;
  /** 칩만 고른 경우 안내할 길이 범위. chipset별 AIB 분포에서 집계한다. */
  readonly chipLengthRangeMm?: readonly [number, number];
}

export interface PcCase extends PartRef {
  readonly supportedMoboFormFactors: readonly string[] | null;
  readonly supportedPsuFormFactors: readonly string[] | null;
  readonly maxGpuLengthMm: number | null;
  readonly maxCpuCoolerHeightMm: number | null;
}

/** PSU 커넥터. PSU는 6핀·8핀을 6+2로 합쳐 세고 12V-2x6을 따로 두지 않는다. */
export interface PsuConnectors {
  readonly pcie6plus2: number | null;
  readonly pcie12vhpwr: number | null;
}

export interface Psu extends PartRef {
  readonly wattage: number | null;
  readonly formFactor: string | null;
  readonly connectors: PsuConnectors;
}

/** 견적. 아직 고르지 않은 부품은 `null`이다 (결측과 구분된다). */
export interface Build {
  readonly cpu: Cpu | null;
  readonly motherboard: Motherboard | null;
  readonly ram: readonly RamKit[];
  readonly gpu: Gpu | null;
  readonly pcCase: PcCase | null;
  readonly psu: Psu | null;
}

export const emptyBuild: Build = {
  cpu: null,
  motherboard: null,
  ram: [],
  gpu: null,
  pcCase: null,
  psu: null,
};
