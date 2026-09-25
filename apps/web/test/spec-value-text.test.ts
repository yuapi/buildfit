/**
 * 스펙 값 표시 — `specValueText`.
 */

import { describe, expect, it } from 'vitest';
import { specValueText } from '../src/lib/spec-labels';

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
