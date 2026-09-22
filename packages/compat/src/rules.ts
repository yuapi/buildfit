/**
 * Phase 0 필수 호환성 규칙 8개.
 *
 * 명세: docs/compat-rules.md — 구현 전에 읽는다.
 * 각 규칙은 선행 부품이 아직 선택되지 않았으면 `null`을 반환한다.
 * 이것은 `unknown`(판정 불가)과 다르다. 미선택은 판정할 대상이 없는 것이다.
 */

import { describeCaseReference } from './case-reference';
import type { Build, Gpu, StorageDrive } from './parts';
import { bayKind, unplacedDrives, usesM2Slot, usesSataPort } from './storage';
import {
  type FieldRef,
  type RuleResult,
  fail,
  inconsistent,
  isFilled,
  missing,
  outOfRange,
  pass,
} from './verdict';
import {
  PCIE_SLOT_POWER_W,
  TIGHT_FIT_RATIO,
  describeAssumptions,
  describeExcluded,
  estimatePower,
} from './power';
import { coolerListCovers, sameSocket } from './sockets';

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
  // 같은 소켓을 다르게 적은 표기가 있다 (TR4/sTR4). 확실한 것만 묶는다 —
  // 묶지 않은 쌍은 오류로 남는다. docs/compat-rules.md §1.1, 이슈 #16
  return sameSocket(cpu.socket!, motherboard.socket!)
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
      return fail(2, 'error', `이 CPU는 ${kit.ramType} 메모리를 지원하지 않습니다.`);
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
      ? `${gpu.chipset} 칩은 모델에 따라 ${range[0]}~${range[1]}mm로 차이가 큽니다.`
      : `${gpu.chipset} 칩은 모델에 따라 길이 차이가 큽니다.`;
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

export const rule7: Rule = ({ cpu, gpu, psu, ram, storage }) => {
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
  // 화면도 같은 함수를 쓴다. 두 벌이 되면 패널의 수치와 판정 기준이 어긋난다.
  const est = estimatePower({
    cpuW: cpuW ?? null,
    gpuW: gpu?.tdp ?? null,
    ramModules: ram.reduce((n, kit) => n + (kit.moduleCount ?? 0), 0),
    storageCount: storage.length,
  });
  const minTotal = est.minW;
  const maxTotal = est.maxW;
  const recommended = est.recommendedW;
  const wattage = psu.wattage ?? 0;
  // 빠진 부품을 먼저 적는다. 가정 설명보다 앞선다 — 구간 자체가 낮다는 뜻이라서다.
  const left = describeExcluded(est.excluded);
  const notes = left ? [left, describeAssumptions()] : [describeAssumptions()];
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

// --- 15. GPU 두께(슬롯) ≤ 케이스 확장 슬롯 수 ------------------------------

/**
 * 슬롯 두께로 받아들일 수 있는 범위. docs/compat-rules.md §15.2
 *
 * 정상 범위는 0.95(로우프로파일)~5이고, 이 밖의 값은 전부 슬롯 자리에 **mm를 넣은**
 * 레코드였다 (120 · 77 · 55.6 · 44). 4건뿐이지만 그대로 두면 멀쩡한 케이스가
 * 전부 오류로 뜬다.
 */
const SLOT_WIDTH_MIN = 1;
const SLOT_WIDTH_MAX = 5;

export const rule15: Rule = ({ gpu, pcCase }) => {
  if (!gpu || !pcCase) return null;

  // 칩만 고른 경우 두께를 단정하지 않는다 (규칙 4의 chipOnly와 같은 이유, §4.1)
  if (gpu.chipOnly === true) {
    return missing(
      15,
      `${gpu.chipset} 칩은 모델에 따라 두께가 다릅니다. 구체적인 모델을 선택해 주세요.`,
      [ref(gpu, 'AIB 모델 (두께)')],
    );
  }

  const gaps: FieldRef[] = [];
  if (!isFilled(gpu.totalSlotWidth)) gaps.push(ref(gpu, '슬롯 두께'));
  if (!isFilled(pcCase.expansionSlots)) gaps.push(ref(pcCase, '확장 슬롯 수'));
  if (gaps.length > 0) {
    return missing(15, '슬롯 정보가 없어 판정하지 못했습니다.', gaps);
  }

  const width = gpu.totalSlotWidth!;
  const slots = pcCase.expansionSlots!;

  if (width < SLOT_WIDTH_MIN || width > SLOT_WIDTH_MAX) {
    return outOfRange(
      15,
      'GPU 두께 값이 슬롯 수로 보이지 않아 판정하지 못했습니다.',
      `두께가 ${width}슬롯으로 적혀 있습니다. 슬롯이 아니라 mm를 적은 것으로 보입니다.`,
      [ref(gpu, '슬롯 두께')],
    );
  }
  // 확장 슬롯이 없는 케이스는 없다. 0은 미입력을 채운 값이다 (§15.2, §8.4와 같은 처리)
  if (slots <= 0) {
    return outOfRange(
      15,
      '케이스 확장 슬롯 수가 0으로 적혀 있어 판정하지 못했습니다.',
      '확장 슬롯이 없는 케이스는 없습니다. 미입력을 0으로 채운 값으로 보입니다.',
      [ref(pcCase, '확장 슬롯 수')],
    );
  }

  // 브래킷이 아니라 쿨러 기준이다. 2.5슬롯 카드는 3번째 칸 자리를 먹는다 (§15.1).
  const need = Math.ceil(width);
  if (need > slots) {
    return fail(
      15,
      'error',
      `GPU가 슬롯 ${need}칸을 차지하는데 케이스에는 ${slots}칸뿐입니다. 들어가지 않습니다.`,
    );
  }
  return {
    ...pass(15, `GPU ${need}칸 / 케이스 ${slots}칸.`),
    // 통과를 "확인됨"으로 읽지 않게 한다. 이 규칙은 필요조건이지 충분조건이 아니다 (§15.3).
    notes: [
      '확장 슬롯 수는 뒷면 구멍의 총 개수입니다. GPU가 꽂히는 자리는 메인보드의 x16 슬롯 위치에 달려 있어, 아래로 남는 칸은 이보다 적을 수 있습니다.',
    ],
  };
};

// --- 16. 총 메모리 용량 ≤ 보드·CPU 최대 -------------------------------------

export const rule16: Rule = ({ cpu, motherboard, ram }) => {
  if (ram.length === 0 || !motherboard) return null;

  const gaps: FieldRef[] = [];
  for (const kit of ram) {
    if (!isFilled(kit.capacityGb)) gaps.push(ref(kit, '용량'));
  }
  if (gaps.length > 0) {
    return missing(16, '메모리 용량 정보가 없어 판정하지 못했습니다.', gaps);
  }

  /**
   * 보드 최대가 슬롯 수보다 작을 수는 없다. 모든 실제 DIMM이 1GB 이상이다.
   *
   * **작다고 버리지 않는다.** 최대 4GB는 LGA775·Atom 보드에서 맞는 값이고 22건이
   * 실재한다. 슬롯 수와 맞대 봐야 틀린 5건만 걸러진다 (§16.2).
   */
  const boardBad =
    isFilled(motherboard.memoryMaxGb) &&
    isFilled(motherboard.memorySlots) &&
    motherboard.memoryMaxGb! < motherboard.memorySlots!;
  const boardMax = isFilled(motherboard.memoryMaxGb) && !boardBad ? motherboard.memoryMaxGb! : null;
  // CPU에는 슬롯이 없으니 0 이하만 본다 (48건)
  const cpuMax = cpu && isFilled(cpu.memoryMaxGb) && cpu.memoryMaxGb! > 0 ? cpu.memoryMaxGb! : null;

  if (boardMax === null && cpuMax === null) {
    if (boardBad) {
      return inconsistent(
        16,
        '메인보드의 최대 메모리 값이 슬롯 수보다 작아 판정하지 못했습니다.',
        `최대 ${motherboard.memoryMaxGb}GB인데 슬롯이 ${motherboard.memorySlots}개입니다. 슬롯마다 최소 1GB는 꽂히므로 있을 수 없는 값입니다.`,
        [ref(motherboard, '최대 메모리')],
      );
    }
    const unknownFields = [ref(motherboard, '최대 메모리')];
    if (cpu) unknownFields.push(ref(cpu, '최대 메모리'));
    return missing(16, '최대 메모리 정보가 없어 판정하지 못했습니다.', unknownFields);
  }

  // 키트를 여러 개 담을 수 있으므로 합산한다. 규칙 3이 모듈 수를 더하는 것과 같다.
  const total = ram.reduce((n, kit) => n + (kit.capacityGb ?? 0), 0);
  // 한쪽만 있으면 있는 쪽으로 판정한다. 둘 다 없을 때만 판정 불가다.
  const limit = Math.min(boardMax ?? Infinity, cpuMax ?? Infinity);
  // 어느 쪽이 한계인지 말한다. 보드가 한계면 보드를 바꾸고, CPU가 한계면 CPU를 바꾼다.
  const bound = cpuMax !== null && cpuMax <= (boardMax ?? Infinity) ? cpu! : motherboard;
  const boundLabel = bound === motherboard ? '메인보드' : 'CPU';

  if (total > limit) {
    // 오류가 아니라 경고다. 제조사 사양은 보수적이고 BIOS 업데이트로 늘어난다. §16.3
    return fail(
      16,
      'warning',
      `메모리 ${total}GB인데 ${boundLabel} 사양은 ${limit}GB까지입니다. BIOS 업데이트로 늘어난 사례가 있으니 제조사 지원 목록을 확인해 주세요.`,
    );
  }
  return pass(16, `메모리 ${total}GB / ${boundLabel} 한계 ${limit}GB.`);
};

// --- 17. M.2 드라이브를 보드가 받는가 -------------------------------------

export const rule17: Rule = ({ motherboard, storage }) => {
  if (storage.length === 0 || !motherboard) return null;

  const gaps: FieldRef[] = [];
  for (const d of storage) {
    if (!isFilled(d.formFactor)) gaps.push(ref(d, '규격'));
  }
  if (!isFilled(motherboard.m2Slots)) gaps.push(ref(motherboard, 'M.2 슬롯 수'));
  if (gaps.length > 0) {
    return missing(17, 'M.2 슬롯 정보가 없어 판정하지 못했습니다.', gaps);
  }

  const need = storage.filter(usesM2Slot).length;
  const notes = unplacedNote(storage);
  const withNotes = (r: RuleResult) => (notes ? { ...r, notes } : r);

  if (need === 0) {
    return withNotes(pass(17, 'M.2 드라이브가 없습니다.'));
  }

  const rows = motherboard.m2Slots!;
  /**
   * `0`은 값이다 — DDR2의 100%, DDR3의 86.3%가 M.2 없는 보드다.
   * DDR5만 다르다. 1,066건 중 0이 3건뿐이고 전부 M.2가 있는 보드였다 (§17.2).
   */
  if (rows === 0) {
    if (motherboard.memoryType === 'DDR5') {
      return inconsistent(
        17,
        'M.2 슬롯 수가 0으로 적혀 있어 판정하지 못했습니다.',
        'DDR5 보드에 M.2가 없는 경우는 확인되지 않았습니다. 미입력을 0으로 채운 값으로 보입니다.',
        [ref(motherboard, 'M.2 슬롯 수')],
      );
    }
    return withNotes(
      fail(17, 'error', `${motherboard.name}에는 M.2 슬롯이 없는데 M.2 드라이브 ${need}개를 담았습니다.`),
    );
  }

  /**
   * ★ **개수는 세지 않는다** (§17.4).
   *
   * 원본의 M.2 배열 길이가 슬롯 수가 아니다. 한 슬롯을 크기마다 행으로 쪼갠
   * 레코드가 섞여 있고(ASUS PRIME B650M-A: 슬롯 2개 · 4행), 반대로 덜 적은
   * 레코드도 있다(Gigabyte Z790 AORUS ELITE AX: 슬롯 4개 · 3행). 같은 계열이
   * 서로 다른 행 수로 존재하는 것이 138건이다 — 위아래 어느 쪽으로도 틀리므로
   * 상한으로도 쓸 수 없다.
   *
   * 믿을 수 있는 것은 **있다 / 없다**뿐이다. 있으면 몇 개인지 모른다고 말한다.
   */
  return inconsistent(
    17,
    `M.2 슬롯이 몇 개인지 알 수 없어 드라이브 ${need}개가 다 들어가는지 판정하지 못했습니다.`,
    '원본의 M.2 목록이 슬롯 수와 맞지 않습니다. 한 슬롯을 크기마다 따로 적은 레코드와 덜 적은 레코드가 섞여 있습니다.',
    [ref(motherboard, 'M.2 슬롯 수')],
  );
};

// --- 18. SATA 드라이브 수 ≤ 보드 SATA 포트 수 -------------------------------

export const rule18: Rule = ({ motherboard, storage }) => {
  if (storage.length === 0 || !motherboard) return null;

  const gaps: FieldRef[] = [];
  for (const d of storage) {
    if (!isFilled(d.interface)) gaps.push(ref(d, '인터페이스'));
  }
  if (!isFilled(motherboard.sataPorts) && !isFilled(motherboard.sataPorts3Gbs)) {
    gaps.push(ref(motherboard, 'SATA 포트 수'));
  }
  if (gaps.length > 0) {
    return missing(18, 'SATA 포트 정보가 없어 판정하지 못했습니다.', gaps);
  }

  // 6Gb/s와 3Gb/s를 합산한다. 둘 다 드라이브가 꽂히는 자리다.
  const ports = (motherboard.sataPorts ?? 0) + (motherboard.sataPorts3Gbs ?? 0);
  /**
   * `0`은 미입력이다 — 규칙 17과 반대다. 세대별 경향이 없이 24.9%가 0이고,
   * SATA가 보편적이던 DDR2·DDR3 보드도 0으로 적혀 있다 (§18.2).
   */
  if (ports === 0) {
    return inconsistent(
      18,
      'SATA 포트 수가 0으로 적혀 있어 판정하지 못했습니다.',
      'SATA 포트가 없는 보드는 드물고, 0으로 적힌 것의 대부분이 미입력이었습니다.',
      [ref(motherboard, 'SATA 포트 수')],
    );
  }

  const need = storage.filter(usesSataPort).length;
  if (need > ports) {
    return fail(18, 'error', `SATA 드라이브가 ${need}개인데 메인보드 포트는 ${ports}개입니다.`);
  }
  return pass(18, `SATA ${need}개 / 포트 ${ports}개.`);
};

// --- 19. 3.5"·2.5" 드라이브 수 ≤ 케이스 베이 수 -----------------------------

export const rule19: Rule = ({ pcCase, storage }) => {
  if (storage.length === 0 || !pcCase) return null;

  const gaps: FieldRef[] = [];
  for (const d of storage) {
    if (!isFilled(d.formFactor)) gaps.push(ref(d, '규격'));
  }
  if (gaps.length > 0) {
    return missing(19, '드라이브 규격 정보가 없어 판정하지 못했습니다.', gaps);
  }

  const need35 = storage.filter((d) => bayKind(d) === '3.5').length;
  const need25 = storage.filter((d) => bayKind(d) === '2.5').length;
  if (need35 === 0 && need25 === 0) {
    return pass(19, '케이스 베이를 쓰는 드라이브가 없습니다.');
  }

  // 필요한 쪽의 베이 수만 본다. 3.5"를 안 쓰는데 3.5" 베이가 결측이라고
  // 판정 불가로 만들지 않는다.
  if (need35 > 0 && !isFilled(pcCase.internal35Bays)) {
    return missing(19, '케이스 베이 정보가 없어 판정하지 못했습니다.', [ref(pcCase, '3.5" 베이 수')]);
  }
  if (need25 > 0 && !isFilled(pcCase.internal25Bays)) {
    return missing(19, '케이스 베이 정보가 없어 판정하지 못했습니다.', [ref(pcCase, '2.5" 베이 수')]);
  }

  // 3.5"는 3.5" 베이 말고 갈 곳이 없다. 넘으면 오류다 (§19.2).
  if (need35 > 0 && need35 > pcCase.internal35Bays!) {
    return fail(
      19,
      'error',
      `3.5" 드라이브가 ${need35}개인데 케이스 베이는 ${pcCase.internal35Bays}개입니다.`,
    );
  }
  // 2.5"는 3.5" 베이나 트레이 뒷면에 붙는 경우가 많다. 오류로 단정하지 않는다.
  if (need25 > 0 && need25 > pcCase.internal25Bays!) {
    return fail(
      19,
      'warning',
      `2.5" 드라이브가 ${need25}개인데 케이스 베이는 ${pcCase.internal25Bays}개입니다. 3.5" 베이나 트레이 뒷면에 붙는 케이스가 많으니 설명서를 확인해 주세요.`,
    );
  }
  const parts: string[] = [];
  if (need35 > 0) parts.push(`3.5" ${need35}개 / 베이 ${pcCase.internal35Bays}개`);
  if (need25 > 0) parts.push(`2.5" ${need25}개 / 베이 ${pcCase.internal25Bays}개`);
  return pass(19, `${parts.join(', ')}.`);
};

/**
 * 어느 자리도 세지 못한 드라이브를 결과에 적는다.
 *
 * 조용히 빠지면 사용자는 검사한 줄 안다. `PCIe`(AIC)와 `mSATA`가 여기 해당한다.
 */
function unplacedNote(storage: readonly StorageDrive[]): string[] | undefined {
  const out = unplacedDrives(storage);
  if (out.length === 0) return undefined;
  const names = out.map((d) => `${d.name}(${d.formFactor})`).join(', ');
  return [`${names}\uB294 M.2\uB3C4 \uCF00\uC774\uC2A4 \uBCA0\uC774\uB3C4 \uC544\uB2C8\uB77C \uC138\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.`];
}

// --- 12. BIOS 업데이트 필요 여부 (Phase 1) ----------------------------------

export const rule12: Rule = ({ cpu, motherboard }) => {
  if (!cpu || !motherboard) return null;

  const gaps: FieldRef[] = [];
  if (!isFilled(cpu.releaseYear)) gaps.push(ref(cpu, '출시 연도'));
  if (!isFilled(motherboard.releaseYear)) gaps.push(ref(motherboard, '출시 연도'));
  if (gaps.length > 0) {
    // 보드 출시 연도는 20.4%만 채워져 있다. 대부분 여기로 온다. docs/compat-rules.md §12.3
    return missing(12, '출시 연도 정보가 없어 BIOS 업데이트 필요 여부를 판정하지 못했습니다.', gaps);
  }

  // 보드가 CPU보다 나중이면 말하지 않는다. 그 개체가 구버전 BIOS를 달고 나왔을
  // 수는 있지만, 판매 시점 보드는 대개 최신이라 경고하면 헛경고가 된다. §12.1
  if (cpu.releaseYear! <= motherboard.releaseYear!) {
    return pass(12, `보드가 CPU와 같거나 더 나중입니다 (${motherboard.releaseYear}년).`);
  }

  // Flashback 결측(0.7%)에서 심각한 쪽으로 가정하지 않는다. §12.2
  if (!isFilled(motherboard.biosFlashback)) {
    return missing(12, 'BIOS Flashback 지원 여부를 알 수 없어 판정하지 못했습니다.', [
      ref(motherboard, 'BIOS Flashback'),
    ]);
  }

  const base = `CPU(${cpu.releaseYear}년)가 메인보드(${motherboard.releaseYear}년)보다 나중에 나왔습니다.`;
  // 연 단위 비교라 같은 해 조합은 가리지 못한다. 그래서 오류가 아니다. §12.1
  return motherboard.biosFlashback === true
    ? fail(12, 'info', `${base} BIOS 업데이트가 필요할 수 있습니다. 이 보드는 Flashback을 지원해 CPU 없이 USB로 올릴 수 있습니다.`)
    : fail(
        12,
        'warning',
        `${base} BIOS 업데이트가 필요할 수 있는데 이 보드는 Flashback을 지원하지 않습니다. 업데이트에 동작하는 다른 CPU가 필요합니다.`,
      );
};

export const phase0Rules: readonly Rule[] = [rule1, rule2, rule3, rule4, rule5, rule6, rule7, rule8];

/** Phase 1에서 추가된 규칙까지. 명세 §4.2 */
/**
 * 규칙 20 — 쿨러가 CPU 소켓을 지원하는가. docs/compat-rules.md §20, 이슈 #17.
 *
 * **경고다.** 우리가 아는 것은 「목록에 없다」뿐이다. AM5가 없는 쿨러 647개 중
 * 363개가 AM4는 적고 있고, 그 상당수는 AM5에도 맞는다고 알려져 있다 — 그런데
 * 데이터로 증명되지 않는다. 그래서 묶지도, 오류로 단정하지도 않는다 (§20.1).
 */
export const rule20: Rule = ({ cpu, cooler }) => {
  if (!cpu || !cooler) return null;
  const gaps: FieldRef[] = [];
  if (!isFilled(cpu.socket)) gaps.push(ref(cpu, '소켓'));
  // 빈 배열은 아무것도 말하지 않는다 — 「지원 소켓 없음」이 아니라 결측이다
  if (!isFilled(cooler.supportedSockets)) gaps.push(ref(cooler, '지원 소켓'));
  if (gaps.length > 0) {
    return missing(20, '쿨러가 지원하는 소켓 정보가 없어 판정하지 못했습니다.', gaps);
  }

  const socket = cpu.socket!;
  // TR4/sTR4 같은 표기 차이와 잘린 「LGA 115」를 보정한다 (§20.2)
  return coolerListCovers(cooler.supportedSockets!, socket)
    ? pass(20, `쿨러가 ${socket} 소켓을 지원합니다.`)
    : fail(
        20,
        'warning',
        // 조사를 소켓 이름에 바로 붙이지 않는다. AM5는 모음으로, LGA 1700은
        // 받침으로 끝나 「이/가」가 반은 틀린다. 「소켓」에 붙이면 늘 맞다
        `쿨러의 지원 소켓 목록에 ${socket} 소켓이 없습니다. 별도 고정 부품이 필요하거나 ` +
          '장착되지 않을 수 있습니다. 제조사 스펙을 확인해 주세요.',
      );
};

export const phase1Rules: readonly Rule[] = [
  ...phase0Rules,
  rule9,
  rule12,
  rule15,
  rule16,
  rule17,
  rule18,
  rule19,
  rule20,
];
