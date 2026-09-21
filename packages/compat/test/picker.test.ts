/**
 * 후보 좁히기 — ADR-0016.
 *
 * 판정과 기준이 다르다는 것이 이 테스트의 핵심이다.
 * 판정은 결측을 `unknown`으로 남기고, 좁히기는 결측을 **남긴다.**
 */

import { describe, expect, it } from 'vitest';
import { pickerConstraints } from '../src/picker';
import { emptyBuild } from '../src/parts';
import * as f from './fixtures';

describe('이미 고른 부품이 후보를 좁힌다', () => {
  it('보드를 골랐으면 CPU는 같은 소켓만', () => {
    const c = pickerConstraints(f.withBuild({ cpu: null }), 'cpu');
    expect(c).toEqual([
      expect.objectContaining({ kind: 'equals', key: 'socket', value: 'AM5', ruleId: 1 }),
    ]);
  });

  it('CPU를 골랐으면 보드도 같은 소켓만', () => {
    const c = pickerConstraints(f.withBuild({ motherboard: null }), 'motherboard');
    expect(c.some((x) => x.kind === 'equals' && x.key === 'socket' && x.value === 'AM5')).toBe(true);
  });

  it('보드의 메모리 규격이 메모리 후보를 좁힌다', () => {
    const c = pickerConstraints(f.withBuild({ ram: [] }), 'ram');
    expect(c).toContainEqual(
      expect.objectContaining({ kind: 'equals', key: 'ram_type', value: 'DDR5', ruleId: 2 }),
    );
  });

  it('케이스가 GPU 길이 상한을 만든다', () => {
    const c = pickerConstraints(f.withBuild({ gpu: null }), 'gpu');
    expect(c).toContainEqual(
      expect.objectContaining({ kind: 'atMost', key: 'length_mm', value: 420, ruleId: 4 }),
    );
  });

  it('GPU가 케이스 하한을 만든다 — 방향이 뒤집힌다', () => {
    const c = pickerConstraints(f.withBuild({ pcCase: null }), 'pcCase');
    expect(c).toContainEqual(
      expect.objectContaining({ kind: 'atLeast', key: 'max_gpu_length_mm', value: 337, ruleId: 4 }),
    );
  });

  it('파워 규격은 케이스가 지원하는 것 중에서만', () => {
    const c = pickerConstraints(f.withBuild({ psu: null }), 'psu');
    expect(c).toContainEqual(
      expect.objectContaining({ kind: 'oneOf', key: 'form_factor', ruleId: 6 }),
    );
  });
});

describe('★ 값이 없으면 좁히지 않는다', () => {
  it('빈 견적은 제약이 없다', () => {
    for (const slot of ['cpu', 'motherboard', 'ram', 'gpu', 'pcCase', 'psu', 'cooler'] as const) {
      expect(pickerConstraints(emptyBuild, slot), slot).toEqual([]);
    }
  });

  it('고른 부품의 스펙이 비어 있으면 제약을 만들지 않는다', () => {
    const noSocket = f.withBuild({ motherboard: { ...f.motherboard, socket: null } });
    expect(pickerConstraints(noSocket, 'cpu')).toEqual([]);
  });

  it('빈 배열도 근거로 쓰지 않는다', () => {
    const noFf = f.withBuild({ pcCase: { ...f.pcCase, supportedPsuFormFactors: [] } });
    expect(pickerConstraints(noFf, 'psu')).toEqual([]);
  });

  it('칩만 고른 GPU는 케이스를 좁히지 않는다 — 길이를 단정할 수 없다', () => {
    const chip = f.withBuild({
      pcCase: null,
      gpu: { ...f.gpu, chipOnly: true, lengthMm: 337 },
    });
    expect(chip && pickerConstraints(chip, 'pcCase').some((c) => c.key === 'max_gpu_length_mm')).toBe(
      false,
    );
  });

  it('쿨러는 어느 방향으로도 좁히지 않는다 — 규칙 9는 경고까지만 낸다', () => {
    // 목록에서 빼는 것은 "오류로 단정"보다 강하다. 규칙 9는 오류를 내지 않는다.
    // 실제로 한계 45mm 케이스에서 수랭 쿨러 대부분이 사라졌었다 —
    // 저장된 height_mm가 라디에이터 높이라 그렇다 (ADR-0016).
    expect(pickerConstraints(f.goodBuild, 'cooler')).toEqual([]);
    expect(
      pickerConstraints(f.withBuild({ pcCase: null }), 'pcCase').some(
        (c) => c.key === 'max_cpu_cooler_height_mm',
      ),
    ).toBe(false);
  });
});

describe('★ 오류를 내는 규칙에서만 제약을 유도한다', () => {
  /**
   * 경고까지만 내는 규칙으로 목록을 빼면, 규칙이 "확인이 필요하다"고 말한 것을
   * 화면이 "없다"로 바꾼다. 사용자는 경고를 볼 기회조차 없어진다.
   *
   * - 규칙 9(쿨러 높이): 경고만. 오류 경계가 없다 (§9.1)
   * - 규칙 12(BIOS): 경고·정보만
   * - 규칙 4: 오류 경계(한계 초과)만 쓰고 빠듯함 경고 구간은 쓰지 않는다 (§4)
   */
  const ERROR_CAPABLE = new Set([1, 2, 3, 4, 5, 6, 7, 8]);

  it('제약의 ruleId가 전부 오류를 낼 수 있는 규칙이다', () => {
    const slots = ['cpu', 'motherboard', 'ram', 'gpu', 'pcCase', 'psu', 'cooler'] as const;
    const ids = new Set(slots.flatMap((s) => pickerConstraints(f.goodBuild, s)).map((c) => c.ruleId));
    expect(ids.size).toBeGreaterThan(0);
    for (const id of ids) {
      expect(ERROR_CAPABLE.has(id), `규칙 ${id}은 경고까지만 내는데 목록을 빼고 있다`).toBe(true);
    }
  });

  it('규칙 4는 오류 경계만 쓴다 — 빠듯함(95%)으로 빼지 않는다', () => {
    const c = pickerConstraints(f.withBuild({ gpu: null }), 'gpu');
    const len = c.find((x) => x.key === 'length_mm');
    // 케이스 한계 420mm 그대로. 420×0.95 = 399가 아니다.
    expect(len).toMatchObject({ kind: 'atMost', value: 420 });
  });
});

describe('제약에 근거가 달려 있다', () => {
  it('모든 제약이 어느 규칙에서 왔는지와 이유를 말한다', () => {
    const all = (['cpu', 'motherboard', 'ram', 'gpu', 'pcCase', 'psu', 'cooler'] as const).flatMap(
      (slot) => pickerConstraints(f.goodBuild, slot),
    );
    expect(all.length).toBeGreaterThan(0);
    for (const c of all) {
      expect(c.ruleId, JSON.stringify(c)).toBeGreaterThan(0);
      expect(c.because, JSON.stringify(c)).toBeTruthy();
    }
  });
});
