/**
 * 규칙 24 — PSU 길이 ≤ 케이스 PSU 최대 길이. docs/compat-rules.md §24, 이슈 #32.
 */
import { describe, expect, it } from 'vitest';
import { rule24 } from '../src/rules';
import * as f from './fixtures';

const build = (len: number | null, max: number | null) =>
  f.withBuild({ psu: { ...f.psu, lengthMm: len }, pcCase: { ...f.pcCase, maxPsuLengthMm: max } });

describe('규칙 24 (이슈 #32)', () => {
  it('한계 안이면 pass — 같으면 들어가는 쪽이다', () => {
    expect(rule24(build(160, 200))?.verdict).toBe('pass');
    expect(rule24(build(200, 200))?.verdict).toBe('pass');
  });

  it('★ 넘으면 오류가 아니라 경고다 — 측정 기준을 원본이 말하지 않는다 (§24.1)', () => {
    const r = rule24(build(220, 180));
    expect(r?.verdict).toBe('fail');
    expect(r?.severity).toBe('warning');
    expect(r?.message).toContain('220mm');
    expect(r?.message).toContain('180mm');
    expect(r?.message).toContain('제조사 스펙을 확인');
  });

  it('어느 한쪽이 없으면 판정 불가 — 케이스 쪽은 14%만 차 있다', () => {
    const r = rule24(build(160, null));
    expect(r?.verdict).toBe('unknown');
    expect(r?.reason?.fields.map((x) => x.field)).toEqual(['PSU 최대 길이']);
    expect(rule24(build(null, 200))?.verdict).toBe('unknown');
  });

  it('파워나 케이스를 안 골랐으면 돌지 않는다', () => {
    expect(rule24(f.withBuild({ psu: null }))).toBeNull();
    expect(rule24(f.withBuild({ pcCase: null }))).toBeNull();
  });
});
