/**
 * 여유 막대의 판정 — 규칙과 어긋나면 안 된다.
 *
 * 화면이 규칙보다 더 말하면 사용자는 둘 중 무엇을 믿어야 할지 모른다.
 * 실제로 한 번 어긋났다: 규칙 9는 빠듯함을 알리지 않기로 했는데(§9.3)
 * 막대가 "빠듯함"이라고 말하고 있었다.
 */

import { TIGHT_FIT_RATIO } from '@buildfit/compat';
import { describe, expect, it } from 'vitest';
import { fitTone } from '../src/components/FitBar';

describe('여유 막대 판정', () => {
  it('한계를 넘으면 over', () => {
    expect(fitTone(358, 349, TIGHT_FIT_RATIO)).toBe('over');
  });

  it('경계는 들어가는 쪽이다 — 정확히 같으면 넘지 않은 것', () => {
    expect(fitTone(349, 349, TIGHT_FIT_RATIO)).not.toBe('over');
  });

  it('규칙 4의 95% 기준을 그대로 쓴다', () => {
    // 349 × 0.95 = 331.55
    expect(fitTone(332, 349, TIGHT_FIT_RATIO)).toBe('tight');
    expect(fitTone(331, 349, TIGHT_FIT_RATIO)).toBe('ok');
  });

  it('tightRatio가 1이면 빠듯함을 말하지 않는다 — 규칙 9 (§9.3)', () => {
    // 165 / 173 = 95.4%. 규칙 4 기준이면 빠듯함이지만 규칙 9는 통과로 본다
    expect(fitTone(165, 173, 1)).toBe('ok');
    expect(fitTone(174, 173, 1)).toBe('over');
  });
});
