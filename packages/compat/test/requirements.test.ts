/**
 * 요구사항 선언(requirements.ts)이 규칙 구현(rules.ts)과 어긋나지 않는지 검증한다.
 *
 * 이 둘이 갈라지면 어드민이 엉뚱한 필드를 채우거나, 막힌 규칙을 놓친다.
 * 선언된 필수 필드를 비우면 해당 규칙이 반드시 판정 불가가 되어야 한다.
 */

import { describe, expect, it } from 'vitest';
import { SPEC_REQUIREMENTS, requiredKeysFor, rulesBlockedBy } from '../src/requirements';
import { phase1Rules } from '../src/rules';
import type { Build } from '../src/parts';
import * as f from './fixtures';

/** specKey → 그 필드를 비운 견적. 선언과 구현을 잇는 유일한 지점이다. */
const BLANK: Record<string, () => Build> = {
  'CPU.socket': () => f.withBuild({ cpu: { ...f.cpu, socket: null } }),
  'Motherboard.socket': () => f.withBuild({ motherboard: { ...f.motherboard, socket: null } }),
  'RAM.ram_type': () => f.withBuild({ ram: [{ ...f.ramKit, ramType: null }] }),
  'Motherboard.memory_type': () => f.withBuild({ motherboard: { ...f.motherboard, memoryType: null } }),
  'RAM.module_count': () => f.withBuild({ ram: [{ ...f.ramKit, moduleCount: null }] }),
  'Motherboard.memory_slots': () => f.withBuild({ motherboard: { ...f.motherboard, memorySlots: null } }),
  'GPU.length_mm': () => f.withBuild({ gpu: { ...f.gpu, lengthMm: null } }),
  'PCCase.max_gpu_length_mm': () => f.withBuild({ pcCase: { ...f.pcCase, maxGpuLengthMm: null } }),
  'Motherboard.form_factor': () => f.withBuild({ motherboard: { ...f.motherboard, formFactor: null } }),
  'PCCase.supported_mobo_form_factors': () =>
    f.withBuild({ pcCase: { ...f.pcCase, supportedMoboFormFactors: null } }),
  'PSU.form_factor': () => f.withBuild({ psu: { ...f.psu, formFactor: null } }),
  'PCCase.supported_psu_form_factors': () =>
    f.withBuild({ pcCase: { ...f.pcCase, supportedPsuFormFactors: null } }),
  'CPU.tdp_w': () => f.withBuild({ cpu: { ...f.cpu, tdp: null, ppt: null } }),
  'GPU.tdp_w': () => f.withBuild({ gpu: { ...f.gpu, tdp: null } }),
  'PSU.wattage_w': () => f.withBuild({ psu: { ...f.psu, wattage: null } }),
  'GPU.pcie_6_pin': () =>
    f.withBuild({ gpu: { ...f.gpu, connectors: { ...f.gpu.connectors, pcie6: null } } }),
  'GPU.pcie_8_pin': () =>
    f.withBuild({ gpu: { ...f.gpu, connectors: { ...f.gpu.connectors, pcie8: null } } }),
  'GPU.pcie_12vhpwr': () =>
    f.withBuild({ gpu: { ...f.gpu, connectors: { ...f.gpu.connectors, pcie12vhpwr: null } } }),
  'GPU.pcie_12v_2x6': () =>
    f.withBuild({ gpu: { ...f.gpu, connectors: { ...f.gpu.connectors, pcie12v2x6: null } } }),
  'PSU.pcie_6_plus_2_pin': () =>
    f.withBuild({ psu: { ...f.psu, connectors: { ...f.psu.connectors, pcie6plus2: null } } }),
  'PSU.pcie_12vhpwr': () =>
    f.withBuild({ psu: { ...f.psu, connectors: { ...f.psu.connectors, pcie12vhpwr: null } } }),
  'CPUCooler.water_cooled': () => f.withBuild({ cooler: { ...f.cooler, waterCooled: null } }),
  'CPUCooler.height_mm': () => f.withBuild({ cooler: { ...f.cooler, heightMm: null } }),
  'PCCase.max_cpu_cooler_height_mm': () =>
    f.withBuild({ pcCase: { ...f.pcCase, maxCpuCoolerHeightMm: null } }),
};

describe('요구사항 선언 ↔ 규칙 구현 정합성', () => {
  const required = SPEC_REQUIREMENTS.filter((r) => r.optional !== true);

  it('선언된 규칙 번호가 전부 구현되어 있다', () => {
    const implemented = new Set(
      phase1Rules.map((rule) => rule(f.goodBuild)?.ruleId).filter((id): id is number => id != null),
    );
    for (const r of required) {
      expect(implemented, `규칙 ${r.ruleId}이 구현되지 않았다`).toContain(r.ruleId);
    }
  });

  it('필수 필드마다 비우는 방법이 정의되어 있다 — 새 요구사항을 추가하면 여기도 채워야 한다', () => {
    for (const r of required) {
      expect(BLANK, `${r.category}.${r.specKey}`).toHaveProperty(`${r.category}.${r.specKey}`);
    }
  });

  it.each(required.map((r) => [`${r.category}.${r.specKey}`, r.ruleId] as const))(
    '%s 를 비우면 규칙 %d이 판정 불가가 된다',
    (key, ruleId) => {
      const build = BLANK[key]?.();
      expect(build, `${key}의 비우기 정의가 없다`).toBeDefined();
      const rule = phase1Rules.find((fn) => fn(f.goodBuild)?.ruleId === ruleId);
      expect(rule, `규칙 ${ruleId} 구현을 찾지 못했다`).toBeDefined();
      const result = rule?.(build!);
      expect(result?.verdict, `${key}를 비웠는데 규칙 ${ruleId}이 ${result?.verdict}였다`).toBe(
        'unknown',
      );
    },
  );
});

describe('조회 헬퍼', () => {
  it('requiredKeysFor는 보조 필드를 빼고 준다', () => {
    const keys = requiredKeysFor('CPU').map((r) => r.specKey);
    expect(keys).toContain('socket');
    expect(keys).toContain('tdp_w');
    // memory_types(규칙 2 보조)와 ppt_w는 optional이라 빠진다
    expect(keys).not.toContain('memory_types');
    expect(keys).not.toContain('ppt_w');
  });

  it('rulesBlockedBy는 그 필드가 막는 규칙을 준다', () => {
    expect(rulesBlockedBy('PCCase', 'supported_psu_form_factors')).toEqual([6]);
    expect(rulesBlockedBy('PCCase', 'max_gpu_length_mm')).toEqual([4]);
  });
});
