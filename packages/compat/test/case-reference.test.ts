import { describe, expect, it } from 'vitest';

import {
  CASE_PSU_REFERENCE,
  MIN_SAMPLE_TO_CITE,
  describeCaseReference,
} from '../src/case-reference';

describe('케이스 참고 분포표 (ADR-0013)', () => {
  it('실린 항목은 모두 인용 기준을 넘는다', () => {
    for (const [ff, e] of Object.entries(CASE_PSU_REFERENCE)) {
      expect(e.sampleSize, ff).toBeGreaterThanOrEqual(MIN_SAMPLE_TO_CITE);
    }
  });

  it('어떤 관측 수도 표본 크기를 넘지 않는다', () => {
    for (const [ff, e] of Object.entries(CASE_PSU_REFERENCE)) {
      for (const o of e.observations) {
        expect(o.count, `${ff} / ${o.formFactor}`).toBeLessThanOrEqual(e.sampleSize);
      }
    }
  });

  it('표본은 모집단의 일부다', () => {
    for (const [ff, e] of Object.entries(CASE_PSU_REFERENCE)) {
      expect(e.sampleSize, ff).toBeLessThanOrEqual(e.populationSize);
    }
  });

  it('모르는 폼팩터는 null', () => {
    expect(describeCaseReference('없는 폼팩터')).toBeNull();
    expect(describeCaseReference(null)).toBeNull();
  });

  it('출처와 측정일을 문장에 넣는다', () => {
    const s = describeCaseReference('ATX Mid Tower');
    expect(s).toContain('BuildCores OpenDB');
    expect(s).toContain('2026-09-19');
  });
});
