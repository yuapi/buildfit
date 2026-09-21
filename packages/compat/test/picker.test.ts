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

  it('수랭 쿨러는 케이스 높이를 좁히지 않는다 (§9.2)', () => {
    const aio = f.withBuild({
      pcCase: null,
      cooler: { ...f.cooler, waterCooled: true, heightMm: 60 },
    });
    expect(
      pickerConstraints(aio, 'pcCase').some((c) => c.key === 'max_cpu_cooler_height_mm'),
    ).toBe(false);
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
