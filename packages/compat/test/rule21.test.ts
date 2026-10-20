/**
 * 규칙 21 — 화면이 나오는가. docs/compat-rules.md §21, 이슈 #23.
 */

import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/engine';
import { pickerConstraints } from '../src/picker';
import { hasIntegratedGraphics, rule21 } from '../src/rules';
import * as f from './fixtures';

const noGpu = (integratedGraphics: string | null, name = 'AMD Ryzen 5 7500F') =>
  f.withBuild({ gpu: null, cpu: { ...f.cpu, name, integratedGraphics } });

describe('규칙 21 (이슈 #23)', () => {
  it('그래픽카드를 골랐으면 내장그래픽과 상관없이 통과한다', () => {
    const b = f.withBuild({ cpu: { ...f.cpu, integratedGraphics: 'None' } });
    expect(rule21(b)?.verdict).toBe('pass');
  });

  it('그래픽카드가 없어도 내장그래픽이 있으면 통과한다', () => {
    const r = rule21(noGpu('AMD Radeon Graphics'));
    expect(r?.verdict).toBe('pass');
    expect(r?.message).toContain('AMD Radeon Graphics');
    // 보드 단자를 모르므로 「화면이 나옵니다」로 단정하지 않는다 (§21.4)
    expect(r?.message).not.toContain('화면이 나옵니다');
    expect(r?.message).toContain('영상 출력 단자');
  });

  it('★ 그래픽카드도 내장그래픽도 없으면 경고한다 — 화면이 안 나온다', () => {
    const r = rule21(noGpu('None'));
    expect(r).toMatchObject({ verdict: 'fail', severity: 'warning' });
    expect(r?.message).toContain('AMD Ryzen 5 7500F');
    expect(r?.message).toContain('그래픽카드를 함께 골라');
  });

  it('★ 「0」도 없음이다 — 7500F 정품 레코드의 표기 (§21.2)', () => {
    expect(rule21(noGpu('0'))?.verdict).toBe('fail');
  });

  it('값이 없으면 추측하지 않는다 — 판정 불가', () => {
    expect(rule21(noGpu(null))?.verdict).toBe('unknown');
    expect(rule21(noGpu('  '))?.verdict).toBe('unknown');
  });

  it('CPU가 없으면 규칙이 돌지 않는다', () => {
    expect(rule21(f.withBuild({ cpu: null, gpu: null }))).toBeNull();
  });

  it('hasIntegratedGraphics — 대소문자·공백을 가리지 않는다', () => {
    expect(hasIntegratedGraphics(' none ')).toBe(false);
    expect(hasIntegratedGraphics('Intel UHD Graphics 730')).toBe(true);
    expect(hasIntegratedGraphics(null)).toBeNull();
  });

  it('경고 규칙이라 고르기를 좁히지 않는다 — 그래픽카드 목록은 그대로다', () => {
    expect(pickerConstraints(noGpu('None'), 'gpu').filter((c) => c.ruleId === 21)).toEqual([]);
  });

  it('검증 중인 값이면 결과에 적힌다 (ADR-0021)', () => {
    const b = f.withBuild({
      gpu: null,
      cpu: { ...f.cpu, integratedGraphics: 'None', contestedSpecs: ['integrated_graphics'] },
    });
    const r = evaluate(b).results.find((x) => x.ruleId === 21);
    expect(r?.contested?.map((c) => c.field)).toEqual(['내장 그래픽']);
  });
});
