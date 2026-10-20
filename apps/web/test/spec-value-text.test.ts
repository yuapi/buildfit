/**
 * 스펙 값 표시 — `specValueText`.
 */

import { SPEC_REQUIREMENTS } from '@buildfit/compat';
import { describe, expect, it } from 'vitest';
import { specLabel, specValueText } from '../src/lib/spec-labels';

describe('specValueText', () => {
  it('배열·불리언을 읽는 형태로', () => {
    expect(specValueText(['ATX', 'SFX'], null)).toBe('ATX, SFX');
    expect(specValueText(true, null)).toBe('있음');
    expect(specValueText(null, 'mm')).toBe('— mm');
    expect(specValueText(162, 'mm')).toBe('162 mm');
  });

  it('★ 라디에이터 크기 0은 「없음」이다 — 공랭 부품에 원본이 0을 적는다 (이슈 #69)', () => {
    expect(specValueText(0, 'mm', 'radiator_size_mm')).toBe('없음');
    expect(specValueText(360, 'mm', 'radiator_size_mm')).toBe('360 mm');
  });

  it('다른 키의 0은 그대로 0이다 — 커넥터 0개는 값이다', () => {
    expect(specValueText(0, null, 'pcie_8_pin')).toBe('0');
  });

  it('키를 주지 않으면 원래 값을 그대로 — 어드민은 고치는 화면이다', () => {
    expect(specValueText(0, 'mm')).toBe('0 mm');
  });
});

/**
 * 불리언은 「있음/없음」으로 보인다. 라벨이 부정이면 이중 부정이 된다 — 쿨러의 `fanless`가
 * 「팬 없음 | 없음」으로 보여 팬이 있는지 읽히지 않았다 (이슈 #72).
 * 값을 뒤집어 보이지 않는다 — 어드민과 신고 폼이 원래 값을 그대로 다룬다.
 */
describe('불리언 라벨', () => {
  // 규칙이 읽지 않는 불리언 키 — 원본에 있는 것 전부 (2026-09-25)
  const DISPLAY_ONLY = ['bios_flashback', 'heat_spreader', 'includes_cooler', 'nvme', 'water_cooled'];
  const keys = [
    ...SPEC_REQUIREMENTS.filter((r) => r.valueType === 'boolean').map((r) => r.specKey),
    ...DISPLAY_ONLY,
  ];

  it.each(keys)('%s의 라벨에 부정어가 없다', (key) => {
    expect(specLabel(key)).not.toMatch(/없|아님|않|무팬|no\b/i);
  });

  it('fanless는 「팬리스 설계」다', () => {
    expect(specLabel('fanless')).toBe('팬리스 설계');
  });
});
