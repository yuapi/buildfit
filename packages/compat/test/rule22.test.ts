/**
 * 규칙 22 — CPU 쿨러가 있는가. docs/compat-rules.md §22, 이슈 #24.
 */

import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/engine';
import { pickerConstraints } from '../src/picker';
import { rule22 } from '../src/rules';
import * as f from './fixtures';

const noCooler = (includesCooler: boolean | null, name = 'AMD Ryzen 7 9800X3D') =>
  f.withBuild({ cooler: null, cpu: { ...f.cpu, name, includesCooler } });

describe('규칙 22 (이슈 #24)', () => {
  it('쿨러를 골랐으면 기본 쿨러와 상관없이 통과한다', () => {
    expect(rule22(f.withBuild({ cpu: { ...f.cpu, includesCooler: false } }))?.verdict).toBe('pass');
  });

  it('쿨러가 없어도 기본 쿨러가 있으면 통과한다', () => {
    expect(rule22(noCooler(true))?.verdict).toBe('pass');
  });

  it('★ 쿨러도 기본 쿨러도 없으면 경고한다', () => {
    const r = rule22(noCooler(false));
    expect(r).toMatchObject({ verdict: 'fail', severity: 'warning' });
    expect(r?.message).toContain('AMD Ryzen 7 9800X3D');
    expect(r?.message).toContain('CPU 쿨러를 함께 골라');
  });

  it('값이 없으면 추측하지 않는다 — 판정 불가', () => {
    expect(rule22(noCooler(null))?.verdict).toBe('unknown');
  });

  it('CPU가 없으면 규칙이 돌지 않는다', () => {
    expect(rule22(f.withBuild({ cpu: null, cooler: null }))).toBeNull();
  });

  it('★ 기본 쿨러가 충분한지는 말하지 않는다 — 근거가 없다', () => {
    const r = rule22(noCooler(true));
    expect(r?.message).not.toMatch(/충분|부족|성능/);
  });

  it('경고 규칙이라 고르기를 좁히지 않는다', () => {
    expect(pickerConstraints(noCooler(false), 'cooler').filter((c) => c.ruleId === 22)).toEqual([]);
  });

  it('검증 중인 값이면 결과에 적힌다 (ADR-0021)', () => {
    const b = f.withBuild({
      cooler: null,
      cpu: { ...f.cpu, includesCooler: false, contestedSpecs: ['includes_cooler'] },
    });
    const r = evaluate(b).results.find((x) => x.ruleId === 22);
    expect(r?.contested?.map((c) => c.field)).toEqual(['기본 쿨러 포함']);
  });
});
