/**
 * 체감 언어 — ADR-0004의 표 그대로다.
 *
 * | ~5% 체감 어려움 | 5~15% 상황에 따라 체감 | 15~30% 체감 가능 | 30%~ 큰 차이 |
 */
import { describe, expect, it } from 'vitest';
import { feltDifference } from '../src/lib/perf';

describe('feltDifference', () => {
  it.each([
    [104, 100, '체감 어려움'],
    [105, 100, '상황에 따라 체감'],
    [114, 100, '상황에 따라 체감'],
    [115, 100, '체감 가능'],
    [129, 100, '체감 가능'],
    [130, 100, '큰 차이'],
  ])('%d 대 %d → %s', (a, b, label) => {
    expect(feltDifference(a, b)?.label).toBe(label);
  });

  it('어느 쪽이 빠른지와 몇 %인지 — 느린 쪽 기준', () => {
    expect(feltDifference(5219, 3279)).toMatchObject({ faster: 'a', percent: 59 });
    expect(feltDifference(3279, 5219)).toMatchObject({ faster: 'b', percent: 59 });
  });

  it('값이 없거나 0이면 말하지 않는다', () => {
    expect(feltDifference(0, 100)).toBeNull();
    expect(feltDifference(Number.NaN, 100)).toBeNull();
  });
});
