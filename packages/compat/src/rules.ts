/**
 * Phase 0 필수 호환성 규칙 8개.
 *
 * 명세: docs/compat-rules.md — 구현 전에 읽는다.
 * 각 규칙은 선행 부품이 아직 선택되지 않았으면 `null`을 반환한다.
 * 이것은 `unknown`(판정 불가)과 다르다. 미선택은 판정할 대상이 없는 것이다.
 */

import { describeCaseReference } from './case-reference';
import type { Build, Gpu } from './parts';
import {
  type FieldRef,
  type RuleResult,
  fail,
  inconsistent,
  isFilled,
  missing,
  pass,
} from './verdict';
import {
  PCIE_SLOT_POWER_W,
  POWER_ASSUMPTIONS,
  PSU_HEADROOM_MULTIPLIER,
  TIGHT_FIT_RATIO,
  describeAssumptions,
} from './power';

export type Rule = (build: Build) => RuleResult | null;

const ref = (part: { name: string; slug?: string | undefined }, field: string): FieldRef => ({
  part: part.name,
  field,
  slug: part.slug,
});

// --- 1. CPU 소켓 = 메인보드 소켓 -------------------------------------------

export const rule1: Rule = ({ cpu, motherboard }) => {
  if (!cpu || !motherboard) return null;
  const gaps: FieldRef[] = [];
  if (!isFilled(cpu.socket)) gaps.push(ref(cpu, '소켓'));
  if (!isFilled(motherboard.socket)) gaps.push(ref(motherboard, '소켓'));
  if (gaps.length > 0) {
    return missing(1, '소켓 정보가 없어 판정하지 못했습니다.', gaps);
  }
  // 두 필드가 같은 enum 값 집합을 공유한다. 정규화 불필요. docs/compat-rules.md §1
  return cpu.socket === motherboard.socket
    ? pass(1, `소켓이 일치합니다 (${cpu.socket}).`)
    : fail(
        1,
        'error',
        `CPU 소켓(${cpu.socket})과 메인보드 소켓(${motherboard.socket})이 다릅니다. 장착되지 않습니다.`,
      );
};

// --- 2. 메모리 규격 일치 ---------------------------------------------------

export const rule2: Rule = ({ cpu, motherboard, ram }) => {
  const kit = ram.length > 0 ? ram[0] : undefined;
  if (!kit || !motherboard) return null;

  const gaps: FieldRef[] = [];
  if (!isFilled(kit.ramType)) gaps.push(ref(kit, '메모리 규격'));
  if (!isFilled(motherboard.memoryType)) gaps.push(ref(motherboard, '지원 메모리 규격'));
  if (gaps.length > 0) {
    return missing(2, '메모리 규격 정보가 없어 판정하지 못했습니다.', gaps);
  }

  if (kit.ramType !== motherboard.memoryType) {
    return fail(
      2,
      'error',
      `이 메모리는 ${kit.ramType}인데 메인보드는 ${motherboard.memoryType}만 지원합니다.`,
    );
  }

  // CPU 쪽은 보조 검사다. 결측이면 건너뛰되 건너뛰었다는 사실을 남긴다.
  // CPU 결측 하나로 전체를 unknown으로 만들지 않는다. docs/compat-rules.md §2
  if (cpu && isFilled(cpu.memoryTypes)) {
    const supported = cpu.memoryTypes ?? [];
    if (kit.ramType !== null && !supported.includes(kit.ramType)) {
      return fail(2, 'error', `이 CPU는 ${kit.ramType}를 지원하지 않습니다.`);
    }
  } else if (cpu) {
    return {
      ...pass(2, `메모리 규격이 일치합니다 (${kit.ramType}).`),
      skipped: ['CPU 지원 메모리 규격 정보가 없어 CPU 쪽 확인은 건너뛰었습니다.'],
    };
  }
  return pass(2, `메모리 규격이 일치합니다 (${kit.ramType}).`);
};

// --- 3. 메모리 모듈 수 ≤ 슬롯 수 -------------------------------------------

export const rule3: Rule = ({ motherboard, ram }) => {
  if (ram.length === 0 || !motherboard) return null;

  const gaps: FieldRef[] = [];
  for (const kit of ram) {
    if (!isFilled(kit.moduleCount)) gaps.push(ref(kit, '모듈 개수'));
  }
  if (!isFilled(motherboard.memorySlots)) gaps.push(ref(motherboard, '메모리 슬롯 수'));
  if (gaps.length > 0) {
    return missing(3, '메모리 슬롯 정보가 없어 판정하지 못했습니다.', gaps);
  }

  // 키트를 여러 개 담을 수 있으므로 합산한다. docs/compat-rules.md §3
  const total = ram.reduce((n, kit) => n + (kit.moduleCount ?? 0), 0);
  const slots = motherboard.memorySlots ?? 0;
  return total <= slots
    ? pass(3, `메모리 ${total}개 / 슬롯 ${slots}개.`)
    : fail(3, 'error', `메모리 모듈이 ${total}개인데 메인보드 슬롯은 ${slots}개입니다.`);
};

// --- 4. GPU 길이 ≤ 케이스 GPU 최대 길이 ------------------------------------

export const rule4: Rule = ({ gpu, pcCase }) => {
  if (!gpu || !pcCase) return null;

  // 칩만 고른 경우 길이를 단정하지 않는다. docs/compat-rules.md §4.1
  if (gpu.chipOnly === true) {
    const range = gpu.chipLengthRangeMm;
    const hint = range
      ? `${gpu.chipset}은 모델에 따라 ${range[0]}~${range[1]}mm로 차이가 큽니다.`
      : `${gpu.chipset}은 모델에 따라 길이 차이가 큽니다.`;
    return missing(4, `${hint} 구체적인 모델을 선택하거나 길이를 직접 입력해 주세요.`, [
      ref(gpu, 'AIB 모델 (길이)'),
    ]);
  }

  const gaps: FieldRef[] = [];
  if (!isFilled(gpu.lengthMm)) gaps.push(ref(gpu, '길이'));
  if (!isFilled(pcCase.maxGpuLengthMm)) gaps.push(ref(pcCase, '장착 가능 GPU 최대 길이'));
  if (gaps.length > 0) {
    return missing(4, 'GPU 길이 정보가 없어 판정하지 못했습니다.', gaps);
  }

  const len = gpu.lengthMm ?? 0;
  const max = pcCase.maxGpuLengthMm ?? 0;
  if (len > max) {
    return fail(4, 'error', `GPU 길이 ${len}mm가 케이스 한계 ${max}mm를 넘습니다.`);
  }
  if (len > max * TIGHT_FIT_RATIO) {
    return fail(
      4,
      'warning',
      `GPU 길이 ${len}mm, 케이스 한계 ${max}mm입니다. 빠듯할 수 있고 전면 팬이나 케이블 정리에 따라 안 들어갈 수 있습니다.`,
    );
  }
  return pass(4, `GPU 길이 ${len}mm / 케이스 한계 ${max}mm.`);
};

// --- 5. 메인보드 폼팩터 ⊂ 케이스 지원 목록 ---------------------------------

export const rule5: Rule = ({ motherboard, pcCase }) => {
  if (!motherboard || !pcCase) return null;

  const gaps: FieldRef[] = [];
  if (!isFilled(motherboard.formFactor)) gaps.push(ref(motherboard, '폼팩터'));
  if (!isFilled(pcCase.supportedMoboFormFactors)) {
    gaps.push(ref(pcCase, '지원 메인보드 폼팩터'));
  }
  if (gaps.length > 0) {
    return missing(5, '폼팩터 정보가 없어 판정하지 못했습니다.', gaps);
  }

  // 하위 호환을 추론하지 않는다. 배열에 없으면 fail이다. docs/compat-rules.md §5
  const supported = pcCase.supportedMoboFormFactors ?? [];
  const ff = motherboard.formFactor;
  return ff !== null && supported.includes(ff)
    ? pass(5, `케이스가 ${ff} 메인보드를 지원합니다.`)
    : fail(
        5,
        'error',
        `이 케이스는 ${ff} 메인보드를 지원하지 않습니다 (지원: ${supported.join(', ')}).`,
      );
};

// --- 6. PSU 폼팩터 ⊂ 케이스 지원 -------------------------------------------

export const rule6: Rule = ({ psu, pcCase }) => {
  if (!psu || !pcCase) return null;

  const gaps: FieldRef[] = [];
  if (!isFilled(psu.formFactor)) gaps.push(ref(psu, '폼팩터'));
  if (!isFilled(pcCase.supportedPsuFormFactors)) {
    gaps.push(ref(pcCase, '지원 파워 폼팩터'));
  }
  if (gaps.length > 0) {
    // 현행 세대 케이스의 83.2%가 여기 해당한다. Phase 0 초기에는 흔하다.
    // 판정은 unknown 그대로 두되, 같은 폼팩터의 관측 분포를 참고로 덧붙인다.
    // 추론해서 pass를 만들지 않는다. ADR-0013
    const note = describeCaseReference(pcCase.formFactor);
    return missing(
      6,
      '이 케이스가 지원하는 파워 규격 정보가 아직 없어 판정하지 못했습니다. 제조사 스펙을 직접 확인해 주세요.',
      gaps,
      note === null ? undefined : [note],
    );
  }

  // 보드 폼팩터로 PSU 폼팩터를 추론하지 않는다. SFX 전용 케이스가 실재한다.
  const supported = pcCase.supportedPsuFormFactors ?? [];
  const ff = psu.formFactor;
  return ff !== null && supported.includes(ff)
    ? pass(6, `케이스가 ${ff} 파워를 지원합니다.`)
    : fail(
        6,
        'error',
        `이 케이스는 ${ff} 파워를 지원하지 않습니다 (지원: ${supported.join(', ')}).`,
      );
};

// --- 7. 소비전력 대비 PSU 정격 (구간 판정) ------------------------------------

export const rule7: Rule = ({ cpu, gpu, psu, ram }) => {
  if (!cpu || !psu) return null;

  const gaps: FieldRef[] = [];
  const cpuW = isFilled(cpu.ppt) ? cpu.ppt : cpu.tdp;
  if (!isFilled(cpuW)) gaps.push(ref(cpu, '소비전력(TDP/PPT)'));
  // GPU를 골랐는데 TDP가 없으면 판정할 수 없다. 안 골랐으면 내장그래픽 구성이다.
  if (gpu && !isFilled(gpu.tdp)) gaps.push(ref(gpu, '소비전력(TDP)'));
  if (!isFilled(psu.wattage)) gaps.push(ref(psu, '정격 출력'));
  if (gaps.length > 0) {
    return missing(7, '소비전력 정보가 없어 판정하지 못했습니다.', gaps);
  }

  // 점 값을 고르지 않는다. 가정을 범위로 두고 판정을 세 갈래로 낸다.
  // docs/compat-rules.md §7.2~7.3
  const modules = ram.reduce((n, kit) => n + (kit.moduleCount ?? 0), 0);
  const base = (cpuW ?? 0) + (gpu?.tdp ?? 0);
  const a = POWER_ASSUMPTIONS;
  const minTotal = Math.round(base + a.motherboard.minW + a.ramPerModule.minW * modules);
  const maxTotal = Math.round(base + a.motherboard.maxW + a.ramPerModule.maxW * modules);
  const recommended = Math.ceil(maxTotal * PSU_HEADROOM_MULTIPLIER);
  const wattage = psu.wattage ?? 0;
  const notes = [describeAssumptions(a)];
  const estimate = `총 소비전력 약 ${minTotal}~${maxTotal}W로 추정됩니다`;

  if (wattage >= recommended) {
    return {
      ...pass(7, `${estimate}. 권장 정격 ${recommended}W, 파워 ${wattage}W로 여유가 있습니다.`),
      notes,
    };
  }
  if (wattage < minTotal) {
    return {
      ...fail(
        7,
        'error',
        `${estimate}. 가정을 가장 낮게 잡아도 ${minTotal}W가 필요한데 파워 정격이 ${wattage}W입니다.`,
      ),
      notes,
    };
  }
  return {
    ...fail(
      7,
      'warning',
      `${estimate}. 권장 정격은 ${recommended}W인데 ${wattage}W라 가정에 따라 갈립니다. 넉넉한 쪽을 권합니다.`,
    ),
    notes,
  };
};

// --- 8. PCIe 보조전원 커넥터 수 충족 ---------------------------------------

/** GPU가 요구하는 커넥터를 PSU 쪽 단위로 정규화한다. docs/compat-rules.md §8.2 */
function normalizeGpuDemand(gpu: Gpu): { eightPin: number; sixteenPin: number } {
  const c = gpu.connectors;
  return {
    eightPin: (c.pcie8 ?? 0) + (c.pcie6 ?? 0),
    sixteenPin: (c.pcie12vhpwr ?? 0) + (c.pcie12v2x6 ?? 0),
  };
}

export const rule8: Rule = ({ gpu, psu }) => {
  if (!gpu || !psu) return null;

  const c = gpu.connectors;
  const gaps: FieldRef[] = [];

  // null을 0으로 간주하지 않는다. 그러면 §8.4의 거짓 통과가 된다.
  const anyNull =
    c.pcie6 === null || c.pcie8 === null || c.pcie12vhpwr === null || c.pcie12v2x6 === null;
  if (anyNull) gaps.push(ref(gpu, '보조전원 커넥터 구성'));
  if (!isFilled(psu.connectors.pcie6plus2)) gaps.push(ref(psu, 'PCIe 6+2핀 커넥터 수'));
  if (!isFilled(psu.connectors.pcie12vhpwr)) gaps.push(ref(psu, '12VHPWR 커넥터 수'));
  if (gaps.length > 0) {
    return missing(8, '보조전원 커넥터 정보가 없어 판정하지 못했습니다.', gaps);
  }

  const demand = normalizeGpuDemand(gpu);

  // ★ 모순 검사. 값이 0이라고 그대로 믿지 않는다.
  // GPU 전체의 20.3%(705/3,468)가 TDP 75W 초과인데 커넥터가 전부 명시적 0이다.
  // 이 검사가 없으면 전부 "보조전원 0개 필요 → 통과"가 된다. docs/compat-rules.md §8.4
  if (
    isFilled(gpu.tdp) &&
    (gpu.tdp ?? 0) > PCIE_SLOT_POWER_W &&
    demand.eightPin === 0 &&
    demand.sixteenPin === 0
  ) {
    return inconsistent(
      8,
      '이 그래픽카드의 보조전원 커넥터 정보가 정확하지 않아 판정하지 못했습니다.',
      `TDP ${gpu.tdp}W는 PCIe 슬롯 공급 한계 ${PCIE_SLOT_POWER_W}W를 넘으므로 보조전원이 반드시 필요한데, 등록된 커넥터가 0개입니다.`,
      [ref(gpu, '보조전원 커넥터 구성')],
    );
  }

  // 알려진 소수 이상치. 보수적으로 판정을 미룬다. docs/compat-rules.md §8.5
  if ((c.pcie12vhpwr ?? 0) > 0 && (c.pcie12v2x6 ?? 0) > 0) {
    return inconsistent(
      8,
      '이 그래픽카드의 보조전원 커넥터 정보가 중복 기입된 것으로 보여 판정하지 못했습니다.',
      '12VHPWR과 12V-2x6이 동시에 기입되어 있습니다. 두 규격은 같은 16핀 커넥터입니다.',
      [ref(gpu, '보조전원 커넥터 구성')],
    );
  }
  if (demand.sixteenPin > 1) {
    return inconsistent(
      8,
      '이 그래픽카드의 보조전원 커넥터 정보가 정확하지 않아 판정하지 못했습니다.',
      `16핀 커넥터 ${demand.sixteenPin}개는 소비자용 카드에서 이례적입니다.`,
      [ref(gpu, '보조전원 커넥터 구성')],
    );
  }

  const have = psu.connectors;
  const ok =
    (have.pcie6plus2 ?? 0) >= demand.eightPin && (have.pcie12vhpwr ?? 0) >= demand.sixteenPin;

  return ok
    ? pass(
        8,
        `보조전원 충족 (필요 8핀 ${demand.eightPin} / 16핀 ${demand.sixteenPin}, 파워 제공 ${have.pcie6plus2} / ${have.pcie12vhpwr}).`,
      )
    : fail(
        8,
        'error',
        `보조전원이 부족합니다. 필요 8핀 ${demand.eightPin}개·16핀 ${demand.sixteenPin}개, 파워 제공 8핀 ${have.pcie6plus2}개·16핀 ${have.pcie12vhpwr}개.`,
      );
};

/** 표시 순서를 고정하기 위해 번호순으로 둔다. docs/compat-rules.md §0.3 */
// --- 9. CPU 쿨러 높이 ≤ 케이스 최대 높이 (Phase 1) --------------------------

export const rule9: Rule = ({ cooler, pcCase }) => {
  if (!cooler || !pcCase) return null;

  // 수랭 여부를 모르면 판정하지 않는다. 높이가 있다고 공랭으로 단정하면
  // AIO의 라디에이터 문제를 통과로 덮는다. docs/compat-rules.md §9.2
  if (!isFilled(cooler.waterCooled)) {
    return missing(9, '수랭 여부를 알 수 없어 판정하지 못했습니다.', [ref(cooler, '수랭 여부')]);
  }

  if (cooler.waterCooled === true) {
    // 통과로 표시하지 않는다. 라디에이터가 들어가는지는 아직 아무도 확인하지 않았다.
    // 규칙 10이 Phase 2 이후라 지금은 확인할 방법이 없다 (명세 §4.2).
    return {
      ruleId: 9,
      verdict: 'unknown',
      severity: 'info',
      message: '수랭 쿨러는 높이가 아니라 라디에이터 장착 위치가 관건입니다.',
      reason: { kind: 'missing', fields: [ref(pcCase, '라디에이터 장착 위치')] },
      skipped: ['높이 비교는 공랭에만 적용합니다. 라디에이터 검사는 아직 준비되지 않았습니다.'],
    };
  }

  const gaps: FieldRef[] = [];
  if (!isFilled(cooler.heightMm)) gaps.push(ref(cooler, '높이'));
  if (!isFilled(pcCase.maxCpuCoolerHeightMm)) gaps.push(ref(pcCase, '쿨러 최대 높이'));
  if (gaps.length > 0) {
    return missing(9, '쿨러 높이 정보가 없어 판정하지 못했습니다.', gaps);
  }

  const height = cooler.heightMm!;
  const limit = pcCase.maxCpuCoolerHeightMm!;
  // 오류가 아니라 경고다. 제조사의 최대 높이는 보수성이 제각각이고, 팬 위치를
  // 옮겨 들어가는 사례가 실재한다. 오류로 단정하면 쓸 수 있는 조합을 막는다. §9.1
  // 여유 구간을 따로 경고하지는 않는다. 한계값이 35.2%만 채워져 있어 그 위에
  // 5% 경계를 얹으면 근거 없는 정밀도를 주장하게 된다. §9.3
  return height <= limit
    ? pass(9, `쿨러 높이 ${height}mm / 케이스 한계 ${limit}mm.`)
    : fail(
        9,
        'warning',
        `쿨러 높이 ${height}mm가 케이스 한계 ${limit}mm를 넘습니다. 제조사 스펙을 확인해 주세요.`,
      );
};

export const phase0Rules: readonly Rule[] = [rule1, rule2, rule3, rule4, rule5, rule6, rule7, rule8];

/** Phase 1에서 추가된 규칙까지. 명세 §4.2 */
export const phase1Rules: readonly Rule[] = [...phase0Rules, rule9];
