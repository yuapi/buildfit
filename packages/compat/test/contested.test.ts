/**
 * 검증 중인 값으로 판정한 사실을 표시하는지 검증한다 — 이슈 #13.
 *
 * 우리가 스스로 의심한다고 표시해 둔 값으로 확정적인 판정을 내놓지 않는다.
 * 가장 중요한 성질은 둘이다.
 *
 * 1. **판정은 바뀌지 않는다.** 값이 없는 것과 다투어지는 것은 다르다 —
 *    신고 하나로 판정을 지우면 신고가 무기가 된다
 * 2. **선언된 필드 전부가 잡힌다.** 규칙을 건드리지 않고 `SPEC_REQUIREMENTS`로
 *    붙이기 때문에, 새 규칙이 늘어도 표시가 빠질 수 없다
 */

import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/engine';
import type { Build, PartRef } from '../src/parts';
import { SPEC_REQUIREMENTS } from '../src/requirements';
import * as f from './fixtures';

/** 카테고리의 모든 부품에 「검증 중」 키를 붙인 견적. */
function contest(category: string, specKey: string): Build {
  const mark = <T extends PartRef>(p: T): T => ({ ...p, contestedSpecs: [specKey] });
  const b = f.goodBuild;
  switch (category) {
    case 'CPU':
      return f.withBuild({ cpu: mark(b.cpu!) });
    case 'Motherboard':
      return f.withBuild({ motherboard: mark(b.motherboard!) });
    case 'RAM':
      return f.withBuild({ ram: b.ram.map(mark) });
    case 'GPU':
      return f.withBuild({ gpu: mark(b.gpu!) });
    case 'PCCase':
      return f.withBuild({ pcCase: mark(b.pcCase!) });
    case 'PSU':
      return f.withBuild({ psu: mark(b.psu!) });
    case 'CPUCooler':
      return f.withBuild({ cooler: mark(b.cooler!) });
    case 'Storage':
      return f.withBuild({ storage: b.storage.map(mark) });
    default:
      throw new Error(`카테고리 ${category}에 검증 중 표시를 붙이는 방법이 없다`);
  }
}

describe('검증 중인 값으로 판정한 사실 (이슈 #13)', () => {
  it('아무것도 다투어지지 않으면 표시가 붙지 않는다', () => {
    for (const r of evaluate(f.goodBuild).results) {
      expect(r.contested, `규칙 ${r.ruleId}에 근거 없이 표시가 붙었다`).toBeUndefined();
    }
  });

  it('★ 판정을 바꾸지 않는다', () => {
    const before = evaluate(f.goodBuild).results;
    for (const req of SPEC_REQUIREMENTS) {
      const after = evaluate(contest(req.category, req.specKey)).results;
      expect(after.map((r) => [r.ruleId, r.verdict, r.message])).toEqual(
        before.map((r) => [r.ruleId, r.verdict, r.message]),
      );
    }
  });

  it.each(
    // 보조 필드(optional)도 센다. 판정 불가를 만들지 않을 뿐 답에는 영향을 준다
    SPEC_REQUIREMENTS.map(
      (r) =>
        [
          `${r.category}.${r.specKey}가 검증 중이면 규칙 ${r.ruleId}에 표시가 붙는다`,
          r.category,
          r.specKey,
          r.ruleId,
        ] as const,
    ),
  )('%s', (label, category, specKey, ruleId) => {
    const result = evaluate(contest(category, specKey)).results.find((r) => r.ruleId === ruleId);
    expect(result, `규칙 ${ruleId}이 기준 견적에서 돌지 않는다`).toBeDefined();
    expect(
      result?.contested?.map((c) => c.field),
      `${label}이 검증 중인데 규칙 ${ruleId}에 표시가 없다`,
    ).toContain(SPEC_REQUIREMENTS.find((r) => r.category === category && r.specKey === specKey)!.label);
  });

  it('부품 이름과 slug를 함께 준다 — 화면이 상세 페이지로 안내한다', () => {
    const result = evaluate(contest('CPU', 'socket')).results.find((r) => r.ruleId === 1);
    expect(result?.contested).toEqual([
      { part: f.cpu.name, field: '소켓', slug: f.cpu.slug },
    ]);
  });

  it('같은 (부품, 필드)를 두 번 넣지 않는다', () => {
    for (const r of evaluate(contest('PCCase', 'supported_mobo_form_factors')).results) {
      const keys = (r.contested ?? []).map((c) => `${c.part}.${c.field}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('다른 부품의 같은 키를 끌어오지 않는다', () => {
    // socket은 CPU와 Motherboard 둘 다 가진 키다. CPU만 다투어질 때
    // 보드의 소켓까지 검증 중으로 적으면 엉뚱한 곳을 보게 된다.
    const result = evaluate(contest('CPU', 'socket')).results.find((r) => r.ruleId === 1);
    expect(result?.contested?.map((c) => c.part)).toEqual([f.cpu.name]);
  });
});
