/**
 * 요구사항 선언(requirements.ts)이 규칙 구현(rules.ts)과 어긋나지 않는지 검증한다.
 *
 * 이 둘이 갈라지면 어드민이 엉뚱한 필드를 채우거나, 막힌 규칙을 놓친다.
 * 선언된 필수 필드를 비우면 해당 규칙이 반드시 판정 불가가 되어야 한다.
 */

import { describe, expect, it } from 'vitest';
import {
  SPEC_REQUIREMENTS,
  missingRequiredFor,
  requiredCondition,
  requiredKeysFor,
  rulesBlockedBy,
} from '../src/requirements';
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
  'PSU.length_mm': () => f.withBuild({ psu: { ...f.psu, lengthMm: null } }),
  'PCCase.max_psu_length_mm': () => f.withBuild({ pcCase: { ...f.pcCase, maxPsuLengthMm: null } }),
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
  // 연도가 이미 문제 없으면 flashback을 비워도 pass다. 규칙 12가 그 필드를
  // 보게 만들려면 CPU가 더 나중인 상황을 함께 만들어야 한다.
  'Motherboard.bios_flashback': () =>
    f.withBuild({ motherboard: { ...f.motherboard, releaseYear: 2022, biosFlashback: null } }),
  'RAM.capacity_gb': () => f.withBuild({ ram: [{ ...f.ramKit, capacityGb: null }] }),
  // 한쪽만 비우면 남은 쪽으로 판정한다 (§16.1). CPU.tdp_w가 ppt까지 비우는 것과 같다.
  'Motherboard.memory_max_gb': () =>
    f.withBuild({
      motherboard: { ...f.motherboard, memoryMaxGb: null },
      cpu: { ...f.cpu, memoryMaxGb: null },
    }),
  'Storage.form_factor': () => f.withBuild({ storage: [{ ...f.drive, formFactor: null }] }),
  'Storage.interface': () => f.withBuild({ storage: [{ ...f.drive, interface: null }] }),
  'Motherboard.m2_slots': () => f.withBuild({ motherboard: { ...f.motherboard, m2Slots: null } }),
  // 3Gb/s만 남아 있으면 판정이 된다. 둘 다 비워야 판정 불가다 (§18).
  // SATA 드라이브가 있어야 포트 수를 본다 (§18.3)
  'Motherboard.sata_ports': () =>
    f.withBuild({
      storage: [f.sataDrive],
      motherboard: { ...f.motherboard, sataPorts: null, sataPorts3Gbs: null },
    }),
  // 3.5" 드라이브가 있어야 그 베이 수를 본다 (§19)
  'PCCase.internal_3_5_bays': () =>
    f.withBuild({
      storage: [f.sataDrive],
      pcCase: { ...f.pcCase, internal35Bays: null },
    }),
  'PCCase.internal_2_5_bays': () =>
    f.withBuild({
      storage: [{ ...f.sataDrive, formFactor: '2.5"' }],
      pcCase: { ...f.pcCase, internal25Bays: null },
    }),
  // 연도는 parts 컬럼이지만 규칙이 읽는 입력이므로 선언에 있다 (이슈 #15).
  // 비우는 방법은 다른 필드와 같다 — 규칙 엔진은 어디 저장되는지 모른다.
  'CPU.release_year': () => f.withBuild({ cpu: { ...f.cpu, releaseYear: null } }),
  'Motherboard.release_year': () =>
    f.withBuild({ motherboard: { ...f.motherboard, releaseYear: null } }),
  'GPU.total_slot_width': () => f.withBuild({ gpu: { ...f.gpu, totalSlotWidth: null } }),
  'CPUCooler.cpu_sockets': () =>
    f.withBuild({ cooler: { ...f.cooler, supportedSockets: null } }),
  'PCCase.expansion_slots': () => f.withBuild({ pcCase: { ...f.pcCase, expansionSlots: null } }),
  // 그래픽카드를 고르면 내장그래픽을 보지 않는다. 안 고른 견적에서 비워야 한다 (§21)
  'CPU.integrated_graphics': () =>
    f.withBuild({ gpu: null, cpu: { ...f.cpu, integratedGraphics: null } }),
  // 쿨러를 고르면 기본 쿨러를 보지 않는다. 안 고른 견적에서 비워야 한다 (§22)
  'CPU.includes_cooler': () => f.withBuild({ cooler: null, cpu: { ...f.cpu, includesCooler: null } }),
  'RAM.form_factor': () => f.withBuild({ ram: [{ ...f.ramKit, formFactor: null }] }),
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

/**
 * `requiredWhen` — 부품 값에 따라 필요 없는 필드 (이슈 #74).
 *
 * 선언이 「필요 없다」고 하는데 규칙이 그 필드를 결측으로 적으면, 집계는 줄었는데 견적은
 * 여전히 「알려주세요」라고 한다. 조건이 **규칙 구현과 같은지** 여기서 맞대 본다.
 */
const BLANK_UNNEEDED: Record<string, () => Build> = {
  // 수랭이면 높이를 묻지 않는다 (§9.2)
  'CPUCooler.height_mm': () => f.withBuild({ cooler: { ...f.cooler, waterCooled: true, heightMm: null } }),
};

describe('조건부 필수 필드 (이슈 #74)', () => {
  const conditional = SPEC_REQUIREMENTS.filter((r) => r.requiredWhen !== undefined);

  it('조건이 있는 선언마다 「필요 없는 경우」가 정의되어 있다', () => {
    for (const r of conditional) {
      expect(BLANK_UNNEEDED, `${r.category}.${r.specKey}`).toHaveProperty(`${r.category}.${r.specKey}`);
    }
  });

  it.each(conditional.map((r) => [`${r.category}.${r.specKey}`, r.ruleId, r.label] as const))(
    '★ %s 는 조건이 맞지 않으면 규칙 %d이 결측으로 적지 않는다',
    (key, ruleId, label) => {
      const build = BLANK_UNNEEDED[key]!();
      const rule = phase1Rules.find((fn) => fn(f.goodBuild)?.ruleId === ruleId)!;
      const result = rule(build);
      const fields = result?.reason?.kind === 'missing' ? result.reason.fields : [];
      expect(fields.map((x) => x.field)).not.toContain(label);
    },
  );

  it('쿨러 높이는 공랭일 때만 필요하다', () => {
    expect(requiredCondition('CPUCooler', 'height_mm')).toEqual({ specKey: 'water_cooled', equals: false });
    // 조건 없는 필드는 null
    expect(requiredCondition('CPUCooler', 'water_cooled')).toBeNull();
    expect(requiredCondition('CPU', 'socket')).toBeNull();
  });

  const missingKeys = (values: [string, unknown][]) =>
    missingRequiredFor('CPUCooler', new Map(values)).map((r) => r.specKey);

  it('★ 수랭 쿨러에 높이가 없어도 빈 필드가 아니다', () => {
    expect(missingKeys([['water_cooled', true], ['cpu_sockets', ['AM5']]])).not.toContain('height_mm');
  });

  it('공랭 쿨러에 높이가 없으면 빈 필드다', () => {
    expect(missingKeys([['water_cooled', false], ['cpu_sockets', ['AM5']]])).toContain('height_mm');
  });

  it('★ 수랭인지 모르면 높이도 빈 필드로 센다 — 공랭이면 필요하다', () => {
    expect(missingKeys([['cpu_sockets', ['AM5']]])).toEqual(expect.arrayContaining(['water_cooled', 'height_mm']));
    expect(missingKeys([['water_cooled', null]])).toContain('height_mm');
  });

  it('키가 있으면 채운 것이다 — 결측 집계와 같은 기준', () => {
    expect(missingKeys([['water_cooled', false], ['height_mm', null]])).not.toContain('height_mm');
  });
});

