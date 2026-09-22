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
  /**
   * canonical slug (§5.2). 판정에는 쓰지 않지만 부품 식별의 일부이고,
   * 화면이 상세 페이지로 링크할 때 필요하다.
   */
  readonly slug?: string | undefined;
}

export interface Cpu extends PartRef {
  readonly socket: string | null;
  /** 정격 TDP (W). */
  readonly tdp: number | null;
  /** 실측 최대 (W). 있으면 이쪽을 우선한다. docs/compat-rules.md §7.1 */
  readonly ppt: number | null;
  /** 지원 메모리 규격. 보조 검사용이라 결측이어도 규칙 2를 막지 않는다. */
  readonly memoryTypes: readonly string[] | null;
  /** 출시 연도. 규칙 12 (BIOS). 1차 소스가 연 단위만 준다 (ADR/§5.8) */
  readonly releaseYear: number | null;
  /** 메모리 컨트롤러가 다루는 최대 총 용량 (GB). 규칙 16 (§16) */
  readonly memoryMaxGb: number | null;
}

export interface Motherboard extends PartRef {
  readonly socket: string | null;
  readonly formFactor: string | null;
  readonly memoryType: string | null;
  readonly memorySlots: number | null;
  /**
   * 원본의 M.2 **행 수** (E키 와이파이 자리를 뺀 것). 규칙 17 (§17).
   *
   * **슬롯 수가 아니다.** 같은 보드 계열이 2·4·6행으로 존재한다 (§17.4).
   * 그래서 규칙 17은 개수를 세지 않고 **있다 / 없다**만 본다.
   *
   * **`0`은 값이다.** M.2가 없는 보드는 실재한다 — DDR2의 100%, DDR3의 86.3%가
   * 그렇다. DDR5의 0만 미입력으로 본다 (§17.2).
   */
  readonly m2Slots: number | null;
  /** SATA 6Gb/s 포트 수. 규칙 18 (§18) */
  readonly sataPorts: number | null;
  /** SATA 3Gb/s 포트 수. 6Gb/s와 합산한다 — 둘 다 드라이브가 꽂히는 자리다 */
  readonly sataPorts3Gbs: number | null;
  /**
   * 보드가 지원하는 최대 총 용량 (GB). 규칙 16 (§16).
   *
   * **작다고 이상치가 아니다.** 4GB는 LGA775·Atom 보드에서 맞는 값이다.
   * 슬롯 수와 맞대 봐야 틀린 값이 드러난다 (§16.2).
   */
  readonly memoryMaxGb: number | null;
  /** 출시 연도. 규칙 12. **20.4%만 채워져 있다** — 대부분 판정 불가가 된다 */
  readonly releaseYear: number | null;
  /**
   * BIOS Flashback 지원. CPU 없이 BIOS를 올릴 수 있는가.
   *
   * 이 한 필드가 규칙 12의 심각도를 가른다. 없으면 CPU가 있어야 업데이트가
   * 되는데, 그 CPU가 바로 못 쓰는 CPU다.
   */
  readonly biosFlashback: boolean | null;
}

/** 메모리는 키트 단위로 선택한다. 여러 키트를 담을 수 있다. */
export interface RamKit extends PartRef {
  readonly ramType: string | null;
  /** 이 키트에 든 모듈 개수. */
  readonly moduleCount: number | null;
  /** 이 키트의 **총** 용량 (GB). 모듈 하나가 아니라 합계다. 규칙 16 (§16) */
  readonly capacityGb: number | null;
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
  /**
   * 쿨러까지 포함해 카드가 차지하는 슬롯 두께. 규칙 15 (§15).
   *
   * OpenDB의 `case_expansion_slot_width`를 쓰지 않는다 — 값이 틀렸다.
   * 두 필드가 다 있는 1,518건 중 48.8%에서 그 값이 이 값보다 작다 (§15.1).
   */
  readonly totalSlotWidth: number | null;
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
  /** OpenDB `form_factor` 원문. 예: "ATX Mid Tower". 판정에는 쓰지 않는다 (ADR-0013) */
  readonly formFactor: string | null;
  readonly supportedMoboFormFactors: readonly string[] | null;
  readonly supportedPsuFormFactors: readonly string[] | null;
  readonly maxGpuLengthMm: number | null;
  readonly maxCpuCoolerHeightMm: number | null;
  /** 뒷면 확장 슬롯 구멍의 개수. 규칙 15 (§15) */
  readonly expansionSlots: number | null;
  /** 내부 3.5" 베이. 규칙 19 (§19). **`0`은 값이다** — Mini-ITX에 실재한다 */
  readonly internal35Bays: number | null;
  /** 내부 2.5" 베이. 규칙 19 */
  readonly internal25Bays: number | null;
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

/**
 * CPU 쿨러. 규칙 9 (Phase 1, `docs/compat-rules.md` §9).
 *
 * `waterCooled`를 높이와 함께 둔다. AIO에도 `height`가 채워진 레코드가 있어서,
 * 높이가 있다고 공랭으로 단정하면 라디에이터 문제를 통과로 덮는다.
 */
export interface CpuCooler extends PartRef {
  readonly heightMm: number | null;
  readonly waterCooled: boolean | null;
  readonly supportedSockets: readonly string[] | null;
}

/**
 * 스토리지 드라이브. 여러 개를 담을 수 있다.
 *
 * 전력은 담지 않는다. NVMe·SATA의 소비전력 범위를 출처와 함께 확보하지 못했고,
 * **추정치를 지어내지 않는다.** 규칙 7은 스토리지를 빼고 계산하며 뺐다는 사실을
 * 결과에 적는다 (docs/compat-rules.md §7.4, 이슈 #5).
 */
export interface StorageDrive extends PartRef {
  /** `M.2-2280` · `2.5"` · `3.5"` · `PCIe` · `mSATA`. 규칙 17·19 (§17, §19) */
  readonly formFactor: string | null;
  /** `SATA 6.0 Gb/s` · `M.2 PCIe 4.0 x4` · `M.2 SATA` 등. 규칙 18 (§18) */
  readonly interface: string | null;
  /** `SSD` · `HDD` · `SSHD`. 판정에는 쓰지 않는다 — 화면 표시용이다 */
  readonly storageType: string | null;
  readonly capacityGb: number | null;
}

/** 견적. 아직 고르지 않은 부품은 `null`이다 (결측과 구분된다). */
export interface Build {
  readonly cpu: Cpu | null;
  readonly motherboard: Motherboard | null;
  readonly ram: readonly RamKit[];
  readonly gpu: Gpu | null;
  readonly pcCase: PcCase | null;
  readonly psu: Psu | null;
  readonly cooler: CpuCooler | null;
  /** 드라이브 여럿. 메모리 킷과 같은 모양이다 */
  readonly storage: readonly StorageDrive[];
}

export const emptyBuild: Build = {
  cpu: null,
  motherboard: null,
  ram: [],
  gpu: null,
  pcCase: null,
  psu: null,
  cooler: null,
  storage: [],
};
