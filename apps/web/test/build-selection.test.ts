/**
 * 견적 불러오기의 입력 검사 — 이슈 #115.
 */
import { describe, expect, it } from 'vitest';
import { sanitizeSelection } from '../src/lib/build-selection';
import { MAX_RAM_KITS, MAX_STORAGE_DRIVES } from '../src/lib/multi-slot';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('sanitizeSelection', () => {
  it('맞는 선택은 그대로 둔다', () => {
    const sel = { cpu: id(1), motherboard: id(2), ram: [id(3), id(4)], storage: [id(5)] };
    expect(sanitizeSelection(sel)).toEqual(sel);
  });

  it('uuid가 아닌 id와 모르는 키를 버린다', () => {
    expect(
      sanitizeSelection({ cpu: "1' or 1=1", gpu: 42, psu: id(9), evil: id(1), ram: ['x', id(3)] }),
    ).toEqual({ psu: id(9), ram: [id(3)] });
  });

  it('★ 여러 개를 담는 칸은 화면의 상한으로 자른다', () => {
    const many = Array.from({ length: 5000 }, (_, i) => id(i));
    const out = sanitizeSelection({ ram: many, storage: many });
    expect(out.ram).toHaveLength(MAX_RAM_KITS);
    expect(out.storage).toHaveLength(MAX_STORAGE_DRIVES);
  });

  it('객체가 아니면 빈 선택', () => {
    for (const v of [null, undefined, 'x', 1, []]) expect(sanitizeSelection(v)).toEqual({});
  });
});
