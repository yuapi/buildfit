/**
 * 규칙 23 — 노트북용(SO-DIMM) 메모리를 데스크톱 보드에 골랐는가. docs/compat-rules.md §23, 이슈 #25.
 */

import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/engine';
import { pickerConstraints } from '../src/picker';
import { isSoDimm, rule23 } from '../src/rules';
import * as f from './fixtures';

const kit = (formFactor: string | null, name = 'Crucial DDR5-5600 SO-DIMM 32GB (2x16GB)') => ({
  ...f.ramKit,
  name,
  formFactor,
});
const board = (formFactor: string | null) => ({ ...f.motherboard, formFactor });

describe('규칙 23 (이슈 #25)', () => {
  it('DIMM 키트는 통과한다', () => {
    expect(rule23(f.goodBuild)?.verdict).toBe('pass');
  });

  it('★ SO-DIMM 키트를 일반 보드에 담으면 경고한다', () => {
    const r = rule23(f.withBuild({ ram: [kit('262-pin SO-DIMM')] }));
    expect(r).toMatchObject({ verdict: 'fail', severity: 'warning' });
    expect(r?.message).toContain('Crucial DDR5-5600 SO-DIMM');
    expect(r?.message).toContain('슬롯 형태를 확인');
  });

  it('여러 키트 중 SO-DIMM만 이름을 댄다', () => {
    const r = rule23(f.withBuild({ ram: [f.ramKit, kit('260-pin SO-DIMM', '노트북 키트')] }));
    expect(r?.message).toContain('노트북 키트');
    expect(r?.message).not.toContain(f.ramKit.name);
  });

  it('★ Thin Mini-ITX 보드는 판정하지 않는다 — SO-DIMM을 쓰기도 한다 (§23.2)', () => {
    const r = rule23(f.withBuild({ ram: [kit('204-pin SO-DIMM')], motherboard: board('Thin Mini-ITX') }));
    expect(r?.verdict).toBe('unknown');
  });

  it('★ DIMM 키트는 보드 폼팩터가 없어도 판정한다 — 보조 입력이다', () => {
    expect(rule23(f.withBuild({ motherboard: board(null) }))?.verdict).toBe('pass');
  });

  it('SO-DIMM인데 보드 폼팩터가 없으면 판정 불가다', () => {
    expect(rule23(f.withBuild({ ram: [kit('262-pin SO-DIMM')], motherboard: board(null) }))?.verdict).toBe('unknown');
  });

  it('키트 폼팩터가 없으면 판정 불가다', () => {
    expect(rule23(f.withBuild({ ram: [kit(null)] }))?.verdict).toBe('unknown');
  });

  it('원본 표기를 모두 가린다', () => {
    for (const ff of ['262-pin SO-DIMM', '260-pin SO-DIMM', '204-pin SO-DIMM', '200-pin SO-DIMM']) {
      expect(isSoDimm(ff), ff).toBe(true);
    }
    for (const ff of ['288-pin DIMM', '240-pin DIMM', '184-pin DIMM', 'UDIMM']) {
      expect(isSoDimm(ff), ff).toBe(false);
    }
  });

  it('경고 규칙이라 고르기를 좁히지 않는다', () => {
    const b = f.withBuild({ ram: [] });
    expect(pickerConstraints(b, 'ram').filter((c) => c.ruleId === 23)).toEqual([]);
  });

  it('검증 중인 값이면 결과에 적힌다 (ADR-0021)', () => {
    const b = f.withBuild({ ram: [{ ...kit('262-pin SO-DIMM'), contestedSpecs: ['form_factor'] }] });
    const r = evaluate(b).results.find((x) => x.ruleId === 23);
    expect(r?.contested?.map((c) => c.field)).toEqual(['메모리 폼팩터']);
  });
});
