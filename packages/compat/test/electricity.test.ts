/**
 * 한국 주택용 전기요금 — 명세 §2.1.
 *
 * **원문의 예시가 계산식을 확정한다.** 한전 화면이 "기타계절 월 300kWh는
 * 전력량요금 45,460원"이라고 적었고, 그 값이 맞는지가 이 파일의 기준이다.
 * 표와 출처: `docs/research/kepco-tariff.md`
 */

import { describe, expect, it } from 'vitest';
import {
  KEPCO_RESIDENTIAL_LOW_VOLTAGE as T,
  addedElectricityCost,
  describeTariffExcluded,
  monthlyBill,
  monthlyKwh,
  seasonOf,
} from '../src/electricity';

describe('★ 원문 예시와 맞는다', () => {
  it('기타계절 300kWh → 전력량요금 45,460원', () => {
    // 200×120.0 + 100×214.6 = 24,000 + 21,460
    const b = monthlyBill(300, { season: 'other' });
    expect(b.energyWon).toBe(45_460);
    // 300kWh는 기본요금 2단(201~400kWh)이다
    expect(b.baseWon).toBe(1_600);
  });

  it('구간마다 단가가 다르다 — 전체에 최고 단가를 쓰지 않는다', () => {
    const b = monthlyBill(300, { season: 'other' });
    expect(b.tiers).toHaveLength(2);
    expect(b.tiers[0]).toMatchObject({ kwh: 200, wonPerKwh: 120.0, won: 24_000 });
    expect(b.tiers[1]).toMatchObject({ kwh: 100, wonPerKwh: 214.6, won: 21_460 });
    // 300 × 307.3 = 92,190이 아니다
    expect(b.energyWon).toBeLessThan(300 * 307.3);
  });
});

describe('계절', () => {
  it('하계는 7·8월, 동계는 12·1·2월', () => {
    expect(seasonOf(new Date('2026-07-15'))).toBe('summer');
    expect(seasonOf(new Date('2026-08-31'))).toBe('summer');
    expect(seasonOf(new Date('2026-12-01'))).toBe('winter');
    expect(seasonOf(new Date('2026-01-31'))).toBe('winter');
    expect(seasonOf(new Date('2026-02-28'))).toBe('winter');
    expect(seasonOf(new Date('2026-06-30'))).toBe('other');
    expect(seasonOf(new Date('2026-09-01'))).toBe('other');
  });

  it('★ 하계는 구간이 넓다 — 단가는 같고 경계만 옮겨진다', () => {
    // 250kWh: 기타계절이면 2구간에 걸치고, 하계면 1구간 안이다
    const other = monthlyBill(250, { season: 'other' });
    const summer = monthlyBill(250, { season: 'summer' });
    expect(other.tiers).toHaveLength(2);
    expect(summer.tiers).toHaveLength(1);
    expect(summer.energyWon).toBeLessThan(other.energyWon);
    // 단가는 그대로다
    expect(summer.tiers[0]?.wonPerKwh).toBe(other.tiers[0]?.wonPerKwh);
  });

  it('동계는 구간 경계가 기타계절과 같다', () => {
    expect(monthlyBill(300, { season: 'winter' }).energyWon).toBe(
      monthlyBill(300, { season: 'other' }).energyWon,
    );
  });

  it('기본요금 구간도 계절에 따라 다르다', () => {
    // 250kWh — 기타계절은 2단(1,600원), 하계는 1단(910원)
    expect(monthlyBill(250, { season: 'other' }).baseWon).toBe(1_600);
    expect(monthlyBill(250, { season: 'summer' }).baseWon).toBe(910);
  });
});

describe('슈퍼유저요금 (§2.3)', () => {
  it('★ 하계·동계에만 1,000kWh 초과 단가가 붙는다', () => {
    const w = monthlyBill(1_200, { season: 'winter' });
    expect(w.superUser).toBe(true);
    expect(w.marginalWonPerKwh).toBe(736.2);
    const s = monthlyBill(1_200, { season: 'summer' });
    expect(s.superUser).toBe(true);
    // 기타계절에는 없다
    const o = monthlyBill(1_200, { season: 'other' });
    expect(o.superUser).toBe(false);
    expect(o.marginalWonPerKwh).toBe(307.3);
    expect(w.energyWon).toBeGreaterThan(o.energyWon);
  });

  it('1,000kWh를 넘은 만큼에만 붙는다', () => {
    const at = monthlyBill(1_000, { season: 'winter' });
    const over = monthlyBill(1_100, { season: 'winter' });
    expect(at.superUser).toBe(false);
    expect(over.energyWon - at.energyWon).toBe(Math.round(100 * 736.2));
  });
});

describe('월 사용량', () => {
  it('W와 시간으로 kWh를 낸다', () => {
    // 500W × 4시간 × 30일 = 60kWh
    expect(monthlyKwh({ watts: 500, hoursPerDay: 4 })).toBe(60);
    expect(monthlyKwh({ watts: 500, hoursPerDay: 4, daysPerMonth: 31 })).toBeCloseTo(62, 5);
  });

  it('하루 24시간을 넘기지 않고 음수를 받지 않는다', () => {
    expect(monthlyKwh({ watts: 100, hoursPerDay: 48 })).toBe(monthlyKwh({ watts: 100, hoursPerDay: 24 }));
    expect(monthlyKwh({ watts: -100, hoursPerDay: 4 })).toBe(0);
    expect(monthlyKwh({ watts: 100, hoursPerDay: -4 })).toBe(0);
    expect(monthlyKwh({ watts: Number.NaN, hoursPerDay: 4 })).toBe(0);
  });
});

describe('★ 가구 사용량에 얹어 추가 요금을 낸다 (명세 §2.1)', () => {
  it('PC 사용량만 따로 곱한 값과 다르다', () => {
    const added = 60;
    const low = addedElectricityCost({ baselineKwh: 150, addedKwh: added, season: 'other' });
    const high = addedElectricityCost({ baselineKwh: 380, addedKwh: added, season: 'other' });
    // 같은 60kWh인데 추가 요금이 다르다. 이것이 이 기능의 존재 이유다
    expect(high.addedWon).toBeGreaterThan(low.addedWon);
    // 150 → 210: 50kWh가 1단, 10kWh가 2단
    expect(low.addedWon).toBe(
      monthlyBill(210, { season: 'other' }).totalWon - monthlyBill(150, { season: 'other' }).totalWon,
    );
  });

  it('★ 누진 구간이 올라갔는지 말한다', () => {
    // 180 → 240: 1단에서 2단으로 넘어간다
    const rose = addedElectricityCost({ baselineKwh: 180, addedKwh: 60, season: 'other' });
    expect(rose.tierRose).toBe(true);
    expect(rose.marginalWonPerKwh).toBe(214.6);
    // 100 → 160: 1단 안에 머문다
    const flat = addedElectricityCost({ baselineKwh: 100, addedKwh: 60, season: 'other' });
    expect(flat.tierRose).toBe(false);
    expect(flat.marginalWonPerKwh).toBe(120.0);
  });

  it('구간을 넘으면 기본요금도 오른다', () => {
    const r = addedElectricityCost({ baselineKwh: 180, addedKwh: 60, season: 'other' });
    expect(r.before.baseWon).toBe(910);
    expect(r.after.baseWon).toBe(1_600);
  });

  it('0을 더하면 추가 요금이 0이다', () => {
    const r = addedElectricityCost({ baselineKwh: 300, addedKwh: 0, season: 'other' });
    expect(r.addedWon).toBe(0);
    expect(r.tierRose).toBe(false);
  });

  it('이상한 입력을 0으로 떨어뜨린다 — 화면이 보낸 값이다', () => {
    const r = addedElectricityCost({ baselineKwh: Number.NaN, addedKwh: -5, season: 'other' });
    expect(r.baselineKwh).toBe(0);
    expect(r.addedKwh).toBe(0);
    expect(r.addedWon).toBe(0);
  });
});

describe('★ 담지 않은 항목을 말한다 (§3)', () => {
  it('무엇이 빠졌고 어느 방향으로 틀렸는지 적는다', () => {
    const s = describeTariffExcluded();
    expect(s).toContain('기후환경요금');
    expect(s).toContain('부가가치세');
    expect(s).toContain('전력산업기반기금');
    // 규칙 7과 같은 방식이다 — 방향을 말한다
    expect(s).toContain('이 값보다 높습니다');
  });

  it('표를 확인한 날을 들고 있다 — 단가는 예고 없이 개정된다', () => {
    expect(T.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(T.source.url).toContain('kepco.co.kr');
  });
});

describe('경계', () => {
  it('0kWh', () => {
    const b = monthlyBill(0, { season: 'other' });
    expect(b.totalWon).toBe(910);
    expect(b.energyWon).toBe(0);
    expect(b.tiers).toHaveLength(0);
  });

  it('구간 경계에서 정확히 끊는다', () => {
    expect(monthlyBill(200, { season: 'other' }).energyWon).toBe(200 * 120);
    expect(monthlyBill(200, { season: 'other' }).baseWon).toBe(910);
    expect(monthlyBill(201, { season: 'other' }).baseWon).toBe(1_600);
    expect(monthlyBill(400, { season: 'other' }).baseWon).toBe(1_600);
    expect(monthlyBill(401, { season: 'other' }).baseWon).toBe(7_300);
  });

  it('★ 원문 본문의 「누진율 2.7배」와 표가 어긋난다 — 표를 따른다', () => {
    // 본문은 "최저와 최고간의 누진율은 2.7배"라고 적었는데 표의 값으로는
    // 307.3 / 120.0 = 2.56배다. 단가가 개정되고 본문이 안 따라온 것으로 보인다.
    // **표를 따른다** — 계산에 쓰는 것은 단가이고, 비율은 설명문이다.
    const first = T.other.energy[0]!.wonPerKwh;
    const third = T.other.energy[2]!.wonPerKwh;
    expect(first).toBe(120.0);
    expect(third).toBe(307.3);
    expect(third / first).toBeCloseTo(2.56, 2);
  });
});
