/**
 * 단독 계산기의 사용량 계산 — 명세 §2.1.
 */

import { monthlyKwh } from '@buildfit/compat';
import { describe, expect, it } from 'vitest';
import { HOURS_PER_DAY, usageKwh } from '../src/lib/usage';

describe('사용 패턴 → 월 사용량', () => {
  it('한 줄이면 monthlyKwh와 같다 — 견적 화면과 같은 식을 쓴다', () => {
    const r = usageKwh([{ watts: 400, hoursPerDay: 4 }]);
    expect(r).toEqual({ ok: true, kwh: monthlyKwh({ watts: 400, hoursPerDay: 4 }) });
  });

  it('게임과 아이들을 더한다', () => {
    const r = usageKwh([
      { watts: 400, hoursPerDay: 4 },
      { watts: 80, hoursPerDay: 6 },
    ]);
    const expected = monthlyKwh({ watts: 400, hoursPerDay: 4 }) + monthlyKwh({ watts: 80, hoursPerDay: 6 });
    expect(r.ok && r.kwh).toBeCloseTo(expected, 6);
  });

  it('아이들 줄은 선택이다 — 비운 줄은 건너뛴다', () => {
    const r = usageKwh([
      { watts: 400, hoursPerDay: 4 },
      { watts: 0, hoursPerDay: 0 },
    ]);
    expect(r).toEqual({ ok: true, kwh: monthlyKwh({ watts: 400, hoursPerDay: 4 }) });
  });

  it('★ 시간 합이 하루를 넘으면 계산하지 않는다 — 그럴듯한 숫자가 나와 틀린 줄 모른다', () => {
    const r = usageKwh([
      { watts: 400, hoursPerDay: 20 },
      { watts: 80, hoursPerDay: 10 },
    ]);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain('30');
  });

  it('하루 꼬박 24시간은 받는다', () => {
    expect(usageKwh([{ watts: 100, hoursPerDay: HOURS_PER_DAY }]).ok).toBe(true);
  });

  it('아무것도 없으면 계산하지 않는다', () => {
    expect(usageKwh([]).ok).toBe(false);
    expect(usageKwh([{ watts: 0, hoursPerDay: 4 }]).ok).toBe(false);
  });

  it('음수·숫자 아님을 막는다', () => {
    expect(usageKwh([{ watts: -100, hoursPerDay: 4 }, { watts: 100, hoursPerDay: 1 }]).ok).toBe(false);
    expect(usageKwh([{ watts: Number.NaN, hoursPerDay: 4 }, { watts: 100, hoursPerDay: 1 }]).ok).toBe(false);
  });
});
