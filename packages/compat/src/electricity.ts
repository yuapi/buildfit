/**
 * 한국 주택용 전기요금 — 명세 §2.1 (★ 최우선 차별점).
 *
 * **PC 전력만 따로 곱하면 의미가 없다.** 한국 주택용은 누진 구간이 있어서, 같은
 * 100kWh가 붙어도 150kWh를 쓰던 집과 380kWh를 쓰던 집의 추가 요금이 다르다.
 * 가구 사용량에 얹혀 구간을 넘는지가 체감을 결정한다.
 *
 * 요율표와 출처: `docs/research/kepco-tariff.md`.
 * 프레임워크에 기대지 않는 순수 함수로 둔다 — 화면과 판정이 같은 코드를 쓴다.
 */

/**
 * 계절. 요율표가 두 겹으로 나뉜다 (`docs/research/kepco-tariff.md` §2).
 *
 * - 구간 경계: 하계 / 그 외 두 갈래
 * - 슈퍼유저요금: 하계 · 동계 / 그 외 세 갈래
 */
export type Season = 'summer' | 'winter' | 'other';

export interface EnergyTier {
  /** 이 구간의 누적 상한 (kWh). 마지막 구간은 `null` */
  readonly upToKwh: number | null;
  readonly wonPerKwh: number;
  /** 화면에 그대로 쓸 이름 */
  readonly label: string;
}

export interface BaseChargeTier {
  readonly upToKwh: number | null;
  readonly won: number;
}

export interface TariffSeasonTable {
  readonly baseCharge: readonly BaseChargeTier[];
  readonly energy: readonly EnergyTier[];
}

export interface Tariff {
  /** 표를 확인한 날. **화면에 그대로 적는다** — 단가는 예고 없이 개정된다 */
  readonly checkedOn: string;
  readonly source: { readonly label: string; readonly url: string };
  /** 하계(7·8월) */
  readonly summer: TariffSeasonTable;
  /** 동계(12·1·2월). 구간 경계는 기타계절과 같고 슈퍼유저요금이 붙는다 */
  readonly winter: TariffSeasonTable;
  /** 기타계절 */
  readonly other: TariffSeasonTable;
  /**
   * 청구액에 더 붙지만 이 표에 없어서 담지 않는 항목.
   *
   * 기후환경요금·연료비조정요금은 분기마다 바뀌고, 부가세·전력산업기반기금은
   * 이 화면에 없다. **그래서 이 계산은 실제 청구액보다 낮다** (§3).
   */
  readonly excluded: readonly string[];
}

/** 슈퍼유저요금. 하계·동계에만 붙는 네 번째 구간이다 (§2.3) */
const SUPER_USER: EnergyTier = {
  upToKwh: null,
  wonPerKwh: 736.2,
  label: '1,000kWh 초과 (슈퍼유저)',
};

const BASE_OTHER: readonly BaseChargeTier[] = [
  { upToKwh: 200, won: 910 },
  { upToKwh: 400, won: 1_600 },
  { upToKwh: null, won: 7_300 },
];

const BASE_SUMMER: readonly BaseChargeTier[] = [
  { upToKwh: 300, won: 910 },
  { upToKwh: 450, won: 1_600 },
  { upToKwh: null, won: 7_300 },
];

/**
 * 한전 주택용전력 **저압**. 고압은 담지 않는다 (§4).
 *
 * 원문의 예시가 계산식을 확정한다 — 기타계절 300kWh는 전력량요금 45,460원이다
 * (200×120.0 + 100×214.6). 구간마다 단가가 다르고 **넘은 만큼에만** 다음 단가를 쓴다.
 */
export const KEPCO_RESIDENTIAL_LOW_VOLTAGE: Tariff = {
  checkedOn: '2026-09-22',
  source: {
    label: '한전 사이버지점 — 주택용전력 요금 누진제',
    url: 'https://cyber.kepco.co.kr/ckepco/front/jsp/CY/E/E/CYEEHP00201.jsp',
  },
  other: {
    baseCharge: BASE_OTHER,
    energy: [
      { upToKwh: 200, wonPerKwh: 120.0, label: '처음 200kWh' },
      { upToKwh: 400, wonPerKwh: 214.6, label: '다음 200kWh' },
      { upToKwh: null, wonPerKwh: 307.3, label: '400kWh 초과' },
    ],
  },
  winter: {
    baseCharge: BASE_OTHER,
    energy: [
      { upToKwh: 200, wonPerKwh: 120.0, label: '처음 200kWh' },
      { upToKwh: 400, wonPerKwh: 214.6, label: '다음 200kWh' },
      { upToKwh: 1_000, wonPerKwh: 307.3, label: '400kWh 초과' },
      SUPER_USER,
    ],
  },
  summer: {
    baseCharge: BASE_SUMMER,
    energy: [
      { upToKwh: 300, wonPerKwh: 120.0, label: '처음 300kWh' },
      { upToKwh: 450, wonPerKwh: 214.6, label: '다음 150kWh' },
      { upToKwh: 1_000, wonPerKwh: 307.3, label: '450kWh 초과' },
      SUPER_USER,
    ],
  },
  excluded: ['기후환경요금', '연료비조정요금', '부가가치세', '전력산업기반기금'],
};

/**
 * 날짜 → 계절.
 *
 * 하계 7/1~8/31, 동계 12/1~2월 말일, 나머지가 기타계절이다 (§2).
 * **월만 본다** — 경계가 모두 월초·월말이라 일까지 볼 필요가 없다.
 */
export function seasonOf(date: Date): Season {
  const month = date.getMonth() + 1;
  if (month === 7 || month === 8) return 'summer';
  if (month === 12 || month === 1 || month === 2) return 'winter';
  return 'other';
}

export function tableFor(season: Season, tariff: Tariff = KEPCO_RESIDENTIAL_LOW_VOLTAGE) {
  return tariff[season];
}

export interface TierCharge {
  readonly label: string;
  readonly kwh: number;
  readonly wonPerKwh: number;
  readonly won: number;
}

export interface Bill {
  readonly kwh: number;
  readonly baseWon: number;
  readonly energyWon: number;
  /** 기본요금 + 전력량요금. **이 표에 없는 항목은 빠져 있다** (§3) */
  readonly totalWon: number;
  readonly tiers: readonly TierCharge[];
  /** 마지막 1kWh에 붙는 단가. 「여기서 더 쓰면 얼마」를 말할 때 쓴다 */
  readonly marginalWonPerKwh: number;
  readonly superUser: boolean;
}

/**
 * 월 사용량 → 요금.
 *
 * **원 단위 처리 방식이 표에 없다.** 반올림으로 두고, 원문 예시(45,460원)가
 * 정확히 맞는 것으로 검산한다.
 */
export function monthlyBill(
  kwh: number,
  opts: { season: Season; tariff?: Tariff },
): Bill {
  const tariff = opts.tariff ?? KEPCO_RESIDENTIAL_LOW_VOLTAGE;
  const table = tariff[opts.season];
  // 음수·NaN은 0으로 떨어뜨린다. 화면이 보낸 값이라 믿지 않는다.
  const total = Number.isFinite(kwh) && kwh > 0 ? kwh : 0;

  const tiers: TierCharge[] = [];
  let used = 0;
  let energy = 0;
  let marginal = table.energy[0]?.wonPerKwh ?? 0;
  let superUser = false;

  for (const tier of table.energy) {
    const ceiling = tier.upToKwh ?? Infinity;
    const inTier = Math.min(total, ceiling) - used;
    if (inTier <= 0) break;
    energy += inTier * tier.wonPerKwh;
    tiers.push({ label: tier.label, kwh: inTier, wonPerKwh: tier.wonPerKwh, won: Math.round(inTier * tier.wonPerKwh) });
    marginal = tier.wonPerKwh;
    if (tier === SUPER_USER) superUser = true;
    used = Math.min(total, ceiling);
    if (used >= total) break;
  }

  const base = table.baseCharge.find((b) => total <= (b.upToKwh ?? Infinity))?.won ?? 0;
  const energyWon = Math.round(energy);
  return {
    kwh: total,
    baseWon: base,
    energyWon,
    totalWon: base + energyWon,
    tiers,
    marginalWonPerKwh: marginal,
    superUser,
  };
}

/** 소비전력과 사용 시간 → 월 사용량 (kWh). */
export function monthlyKwh(input: {
  watts: number;
  hoursPerDay: number;
  /** 한 달을 며칠로 볼까. 기본 30일 */
  daysPerMonth?: number;
}): number {
  const days = input.daysPerMonth ?? 30;
  if (!Number.isFinite(input.watts) || !Number.isFinite(input.hoursPerDay)) return 0;
  const w = Math.max(0, input.watts);
  const h = Math.min(24, Math.max(0, input.hoursPerDay));
  return (w * h * days) / 1000;
}

export interface AddedCost {
  readonly baselineKwh: number;
  readonly addedKwh: number;
  readonly before: Bill;
  readonly after: Bill;
  /** PC 때문에 더 내는 금액 */
  readonly addedWon: number;
  /**
   * 누진 구간이 올라갔는가.
   *
   * **이것이 이 기능의 핵심이다** (명세 §2.1). 같은 사용량이 붙어도 구간을
   * 넘는 집과 안 넘는 집의 추가 요금이 두 배 이상 갈린다.
   */
  readonly tierRose: boolean;
  /** 올라간 구간에서 1kWh를 더 쓸 때의 단가 */
  readonly marginalWonPerKwh: number;
}

/**
 * 가구 사용량에 PC 사용량을 얹어 **추가 요금**을 낸다.
 *
 * 차액으로 낸다. PC 사용량만 따로 계산하면 누진 구간을 반영하지 못한다.
 */
export function addedElectricityCost(input: {
  baselineKwh: number;
  addedKwh: number;
  season: Season;
  tariff?: Tariff;
}): AddedCost {
  const baseline = Number.isFinite(input.baselineKwh) && input.baselineKwh > 0 ? input.baselineKwh : 0;
  const added = Number.isFinite(input.addedKwh) && input.addedKwh > 0 ? input.addedKwh : 0;
  const opts = { season: input.season, ...(input.tariff ? { tariff: input.tariff } : {}) };
  const before = monthlyBill(baseline, opts);
  const after = monthlyBill(baseline + added, opts);
  return {
    baselineKwh: baseline,
    addedKwh: added,
    before,
    after,
    addedWon: after.totalWon - before.totalWon,
    tierRose: after.marginalWonPerKwh > before.marginalWonPerKwh,
    marginalWonPerKwh: after.marginalWonPerKwh,
  };
}

/** 계산에 넣지 않은 항목을 한 줄로. 규칙 7의 `describeExcluded`와 같은 방식이다. */
export function describeTariffExcluded(tariff: Tariff = KEPCO_RESIDENTIAL_LOW_VOLTAGE): string {
  return `${tariff.excluded.join(', ')}은 넣지 않았습니다. 실제 청구액은 이 값보다 높습니다.`;
}
