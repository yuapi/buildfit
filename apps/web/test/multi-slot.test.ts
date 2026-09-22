/**
 * 메모리 묶음 고르기.
 *
 * **공유 링크가 담은 두 묶음을 열어서 손대는 순간 한 묶음이 사라졌다.**
 * 화면이 한 묶음만 다뤘기 때문이다 — 공유 코드는 255묶음까지 담고,
 * 규칙 3은 이미 여러 묶음의 모듈 수를 합쳐서 본다.
 */

import { describe, expect, it } from 'vitest';
import {
  MAX_RAM_KITS,
  MAX_STORAGE_DRIVES,
  addToSlot,
  isMultiSlot,
  maxForSlot,
  removeFromSlot,
} from '../src/lib/multi-slot';

const addRamKit = (cur: readonly string[], id: string) => addToSlot(cur, id, MAX_RAM_KITS);
const removeRamKit = removeFromSlot;

const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const B = 'bbbbbbbb-2222-4222-8222-222222222222';
const C = 'cccccccc-3333-4333-8333-333333333333';

describe('더하기', () => {
  it('★ 덮어쓰지 않고 덧붙인다', () => {
    // 덮어쓰면 2묶음 견적을 만들 수 없다. 그게 이 결함의 원인이었다.
    expect(addRamKit([], A)).toEqual([A]);
    expect(addRamKit([A], B)).toEqual([A, B]);
  });

  it('원본을 바꾸지 않는다', () => {
    const before = [A];
    addRamKit(before, B);
    expect(before).toEqual([A]);
  });

  it('★ 같은 묶음을 두 번 넣지 않는다', () => {
    // 같은 id가 둘이면 화면에서 어느 것을 빼는지 말할 수 없다.
    expect(addRamKit([A], A)).toEqual([A]);
    expect(addRamKit([A, B], A)).toEqual([A, B]);
  });

  it('상한을 넘기지 않는다', () => {
    const full = Array.from({ length: MAX_RAM_KITS }, (_, i) => `id-${i}`);
    expect(addRamKit(full, C)).toEqual(full);
    expect(addRamKit(full.slice(0, -1), C)).toHaveLength(MAX_RAM_KITS);
  });

  it('빈 id는 넣지 않는다', () => {
    expect(addRamKit([A], '')).toEqual([A]);
  });
});

describe('빼기', () => {
  it('id를 주면 그것만 뺀다', () => {
    expect(removeRamKit([A, B, C], B)).toEqual([A, C]);
  });

  it('★ id를 안 주면 전부 뺀다', () => {
    expect(removeRamKit([A, B], undefined)).toEqual([]);
    expect(removeRamKit([A, B])).toEqual([]);
  });

  it('★ 빈 문자열로는 전부 빠지지 않는다 — 그건 "아무것도 아닌 id"다', () => {
    // 「전부 제거」가 빈 문자열을 넘기면 아무것도 안 걸러져 조용히 실패한다.
    // 실제로 그렇게 짰다가 고쳤다.
    expect(removeRamKit([A, B], '')).toEqual([A, B]);
  });

  it('없는 것을 빼도 던지지 않는다', () => {
    expect(removeRamKit([A], C)).toEqual([A]);
    expect(removeRamKit([], A)).toEqual([]);
  });
});

describe('상한 자체', () => {
  it('공유 코드가 담는 것보다 작다', () => {
    // 코드는 255까지 담지만 주소가 길어질 이유가 없다.
    expect(MAX_RAM_KITS).toBeGreaterThan(1);
    expect(MAX_RAM_KITS).toBeLessThan(255);
  });
});

describe('칸마다 상한이 다르다', () => {
  it('메모리와 스토리지만 여럿을 담는다', () => {
    expect(isMultiSlot('ram')).toBe(true);
    expect(isMultiSlot('storage')).toBe(true);
    expect(isMultiSlot('cpu')).toBe(false);
    expect(isMultiSlot('pcCase')).toBe(false);
  });

  it('상한을 칸별로 준다', () => {
    expect(maxForSlot('ram')).toBe(MAX_RAM_KITS);
    expect(maxForSlot('storage')).toBe(MAX_STORAGE_DRIVES);
    // 여럿을 담지 않는 칸은 1이다
    expect(maxForSlot('cpu')).toBe(1);
  });

  it('스토리지는 메모리보다 많이 담는다', () => {
    const ids = Array.from({ length: MAX_STORAGE_DRIVES + 2 }, (_, i) => `d${i}`);
    const out = ids.reduce<string[]>((cur, id) => addToSlot(cur, id, MAX_STORAGE_DRIVES), []);
    expect(out).toHaveLength(MAX_STORAGE_DRIVES);
    expect(MAX_STORAGE_DRIVES).toBeGreaterThan(MAX_RAM_KITS);
  });
});
