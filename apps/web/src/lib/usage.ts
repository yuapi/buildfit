/**
 * 하루 사용 패턴 → 월 사용량 — 명세 §2.1.
 *
 * 명세의 입력은 「PC 사용 패턴(게임 n시간/일, 아이들 m시간)」이다. 견적 화면은
 * 부품에서 소비전력을 추정하지만, 단독 계산기(`/calc/power`)는 견적이 없으므로
 * **사용자가 W를 직접 넣는다.** 아이들 전력을 우리가 지어내지 않기 위해서다 —
 * 근거 없는 수치를 만들지 않는다.
 *
 * 순수 함수다. 화면 밖에서 테스트한다.
 */

import { monthlyKwh } from '@buildfit/compat';

export interface UsageRow {
  /** 그 상태에서의 소비전력 (W) */
  readonly watts: number;
  /** 하루에 그 상태로 있는 시간 */
  readonly hoursPerDay: number;
}

export type UsageResult =
  | { readonly ok: true; readonly kwh: number }
  | { readonly ok: false; readonly message: string };

/** 하루는 24시간이다. 게임 20시간 + 아이들 10시간은 입력 실수다 */
export const HOURS_PER_DAY = 24;

/**
 * 사용 패턴 여러 줄을 월 사용량으로 합친다.
 *
 * 빈 줄(0W 또는 0시간)은 건너뛴다 — 아이들 줄은 선택이다. 한 줄도 없으면 계산하지
 * 않는다. **시간 합이 하루를 넘으면 계산하지 않는다** — 넘긴 채로 곱하면 그럴듯한
 * 숫자가 나와서 틀린 줄 모른다.
 */
export function usageKwh(rows: readonly UsageRow[]): UsageResult {
  const used = rows.filter((r) => r.watts > 0 && r.hoursPerDay > 0);
  if (used.length === 0) return { ok: false, message: '소비전력과 시간을 넣으면 계산합니다.' };

  for (const r of rows) {
    if (!Number.isFinite(r.watts) || !Number.isFinite(r.hoursPerDay)) {
      return { ok: false, message: '숫자를 넣어 주세요.' };
    }
    if (r.watts < 0 || r.hoursPerDay < 0) {
      return { ok: false, message: '0보다 작은 값은 넣을 수 없습니다.' };
    }
  }

  const hours = used.reduce((n, r) => n + r.hoursPerDay, 0);
  if (hours > HOURS_PER_DAY) {
    return {
      ok: false,
      message: `하루는 ${HOURS_PER_DAY}시간입니다. 지금 합이 ${hours}시간입니다.`,
    };
  }

  return {
    ok: true,
    kwh: used.reduce((n, r) => n + monthlyKwh({ watts: r.watts, hoursPerDay: r.hoursPerDay }), 0),
  };
}
