/**
 * 선언(`RULE_PARTS`)이 구현(`rules.ts`의 미선택 처리)과 어긋나지 않는지 검증한다.
 *
 * 어긋나면 화면이 "케이스를 고르면 규칙 6을 볼 수 있다"고 안내해놓고
 * 케이스를 골라도 안 나오거나, 반대로 안내 없이 규칙이 사라진다.
 */

import { describe, expect, it } from 'vitest';
import { RULE_PARTS, SLOT_LABELS, blockingSlots, notApplicable } from '../src/applicability';
import type { PartSlot } from '../src/applicability';
import { emptyBuild } from '../src/parts';
import { phase1Rules } from '../src/rules';
import * as f from './fixtures';

const RULE_BY_ID = new Map(
  phase1Rules.map((rule) => [rule(f.goodBuild)?.ruleId, rule] as const),
);

const empty = (slot: PartSlot) =>
  slot === 'ram' ? f.withBuild({ ram: [] }) : f.withBuild({ [slot]: null });

describe('RULE_PARTS 선언 ↔ 규칙 구현', () => {
  it('선언된 규칙이 전부 구현되어 있다', () => {
    for (const id of Object.keys(RULE_PARTS).map(Number)) {
      expect(RULE_BY_ID.get(id), `규칙 ${id} 구현이 없다`).toBeDefined();
    }
  });

  it('구현된 규칙이 전부 선언되어 있다 — 새 규칙을 추가하면 여기도 채워야 한다', () => {
    for (const rule of phase1Rules) {
      const id = rule(f.goodBuild)?.ruleId;
      expect(id, '기준 견적에서 결과를 내지 못한 규칙이 있다').toBeDefined();
      expect(RULE_PARTS, `규칙 ${id}`).toHaveProperty(String(id));
    }
  });

  it.each(
    Object.entries(RULE_PARTS).flatMap(([id, slots]) =>
      slots.map((slot) => [Number(id), slot] as const),
    ),
  )('규칙 %d은 %s를 비우면 결과에서 빠진다', (ruleId, slot) => {
    expect(RULE_BY_ID.get(ruleId)?.(empty(slot))).toBeNull();
  });

  it('선언하지 않은 부품은 규칙을 막지 않는다', () => {
    for (const [id, slots] of Object.entries(RULE_PARTS)) {
      const ruleId = Number(id);
      const others = (Object.keys(SLOT_LABELS) as PartSlot[]).filter((s) => !slots.includes(s));
      for (const slot of others) {
        expect(
          RULE_BY_ID.get(ruleId)?.(empty(slot)),
          `규칙 ${ruleId}이 ${slot} 때문에 빠졌다. 선언에 없는 의존이다`,
        ).not.toBeNull();
      }
    }
  });
});

describe('notApplicable', () => {
  it('빈 견적에서는 모든 규칙이 미적용이다', () => {
    const na = notApplicable(emptyBuild);
    expect(na.map((x) => x.ruleId)).toEqual(Object.keys(RULE_PARTS).map(Number).sort((a, b) => a - b));
  });

  it('전부 고른 견적에서는 미적용이 없다', () => {
    expect(notApplicable(f.goodBuild)).toEqual([]);
  });

  it('무엇이 막고 있는지 부품 단위로 말한다', () => {
    const na = notApplicable(f.withBuild({ pcCase: null }));
    expect(na.map((x) => x.ruleId)).toEqual([4, 5, 6, 9]);
    expect(na.every((x) => x.needs.includes('pcCase'))).toBe(true);
  });

  it('막고 있는 부품 목록은 중복 없이 모인다', () => {
    expect(blockingSlots(f.withBuild({ pcCase: null, psu: null })).sort()).toEqual([
      'pcCase',
      'psu',
    ]);
  });

  it('모든 슬롯에 표시 이름이 있다', () => {
    for (const slots of Object.values(RULE_PARTS)) {
      for (const s of slots) expect(SLOT_LABELS[s], s).toBeTruthy();
    }
  });
});
