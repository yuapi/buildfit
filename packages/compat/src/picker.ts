/**
 * 고를 때 안 맞는 것을 걸러내는 제약 — ADR-0016.
 *
 * 카탈로그가 22,962건이고 대부분 구세대다. AM5 보드를 고른 사람에게 LGA1151
 * CPU를 보여주면 목록이 쓸모없다. **이미 고른 부품이 답을 좁힌다.**
 *
 * 여기서 하는 일은 판정이 아니라 **후보 좁히기**다. 둘은 기준이 다르다.
 *
 * - 판정: 값이 없으면 `unknown`. 통과시키지 않는다 (ADR-0009)
 * - 좁히기: 값이 없으면 **남긴다.** 숨기면 사용자가 그 부품을 찾을 방법이 없다
 *
 * 그래서 제약은 전부 "**아는데 어긋나는 것만 뺀다**"로 쓴다. 이 방향을 뒤집으면
 * 스펙이 비어 있다는 이유로 멀쩡한 부품이 목록에서 사라진다.
 *
 * 규칙 엔진과 같은 사실을 쓰되 코드는 따로 둔다. 규칙은 `Build`를 받고
 * 이쪽은 아직 고르지 않은 후보를 상대하므로 입력이 다르다. 대신 **어느 규칙에서
 * 온 제약인지**를 `ruleId`로 달아 둘이 어긋나면 테스트가 잡게 한다.
 *
 * **오류를 내는 규칙에서만 제약을 유도한다.** 경고까지만 내는 규칙(9·12)으로
 * 목록을 빼면, 규칙이 "확인이 필요하다"고 말한 것을 화면이 "없다"로 바꾼다.
 * 규칙 4도 오류 경계(한계 초과)만 쓰고 빠듯함 경고 구간은 쓰지 않는다.
 */

import type { PartSlot } from './applicability';
import type { Build } from './parts';
import { bayKind, usesM2Slot } from './storage';

/** 후보의 `part_specs.key`에 걸리는 조건. DB 계층이 SQL로 옮긴다. */
export type Constraint =
  /** 그 키의 값이 `value`와 달라야 제외 */
  | { readonly kind: 'equals'; readonly key: string; readonly value: string; readonly ruleId: number; readonly because: string }
  /** 그 키의 값이 `values` 중 어느 것도 아니면 제외 */
  | { readonly kind: 'oneOf'; readonly key: string; readonly values: readonly string[]; readonly ruleId: number; readonly because: string }
  /** 배열 스펙이 `value`를 포함하지 않으면 제외 */
  | { readonly kind: 'contains'; readonly key: string; readonly value: string; readonly ruleId: number; readonly because: string }
  /**
   * 숫자 스펙이 `value`보다 크면 제외.
   *
   * `ignoreAbove`가 있으면 그보다 큰 값은 **어긋남으로 치지 않는다.** 그 크기가
   * 그 필드에 있을 수 없는 값이라 단위를 잘못 적은 것이기 때문이다 — 규칙이
   * 판정 불가로 두는 값을(§15.2) 거르기가 숨겨 버리면, 사용자는 그 부품을
   * 찾을 방법이 없어진다. 좁히기는 판정이 아니다 (ADR-0016).
   */
  | { readonly kind: 'atMost'; readonly key: string; readonly value: number; readonly ruleId: number; readonly because: string; readonly ignoreAbove?: number }
  /** 숫자 스펙이 `value`보다 작으면 제외 */
  | { readonly kind: 'atLeast'; readonly key: string; readonly value: number; readonly ruleId: number; readonly because: string };

/**
 * M.2 슬롯을 쓰지 않는 드라이브 규격. 규칙 17의 좁히기에 쓴다.
 *
 * `requirements.ts`의 `STORAGE_FORM_FACTORS`에서 M.2를 뺀 것이고,
 * 둘이 어긋나지 않는지는 테스트가 지킨다.
 */
const NON_M2_FORM_FACTORS: readonly string[] = ['2.5"', '3.5"', 'PCIe', 'mSATA'];

/** 슬롯 두께로 받아들일 수 있는 범위. docs/compat-rules.md §15.2 */
const MIN_SANE_SLOT_WIDTH = 1;
const MAX_SANE_SLOT_WIDTH = 5;

function filled<T>(v: T | null | undefined): v is T {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/**
 * 이미 고른 부품에서 유도되는 후보 제약.
 *
 * 고르지 않았거나 값이 비어 있으면 제약을 만들지 않는다 — 없는 근거로
 * 목록을 좁히지 않는다.
 */
export function pickerConstraints(build: Build, slot: PartSlot): Constraint[] {
  const out: Constraint[] = [];
  const { cpu, motherboard, gpu, pcCase, psu, storage } = build;

  // --- 규칙 1: 소켓 ---
  if (slot === 'cpu' && motherboard && filled(motherboard.socket)) {
    out.push({
      kind: 'equals',
      key: 'socket',
      value: motherboard.socket,
      ruleId: 1,
      because: `${motherboard.name}의 소켓 ${motherboard.socket}`,
    });
  }
  if (slot === 'motherboard' && cpu && filled(cpu.socket)) {
    out.push({
      kind: 'equals',
      key: 'socket',
      value: cpu.socket,
      ruleId: 1,
      because: `${cpu.name}의 소켓 ${cpu.socket}`,
    });
  }

  // --- 규칙 2: 메모리 규격 ---
  if (slot === 'ram' && motherboard && filled(motherboard.memoryType)) {
    out.push({
      kind: 'equals',
      key: 'ram_type',
      value: motherboard.memoryType,
      ruleId: 2,
      because: `${motherboard.name}의 메모리 규격 ${motherboard.memoryType}`,
    });
  }

  // --- 규칙 4: GPU 길이 ---
  if (slot === 'gpu' && pcCase && filled(pcCase.maxGpuLengthMm)) {
    out.push({
      kind: 'atMost',
      key: 'length_mm',
      value: pcCase.maxGpuLengthMm,
      ruleId: 4,
      because: `${pcCase.name}의 GPU 한계 ${pcCase.maxGpuLengthMm}mm`,
    });
  }
  // 칩만 고른 경우 길이를 단정하지 않는다 (규칙 4의 chipOnly와 같은 이유)
  if (slot === 'pcCase' && gpu && gpu.chipOnly !== true && filled(gpu.lengthMm)) {
    out.push({
      kind: 'atLeast',
      key: 'max_gpu_length_mm',
      value: gpu.lengthMm,
      ruleId: 4,
      because: `${gpu.name} 길이 ${gpu.lengthMm}mm`,
    });
  }

  // --- 규칙 15: GPU 두께 ---
  // 두께가 슬롯 수로 보이지 않는 값은 거르기에 쓰지 않는다 (§15.2). 거르기는 판정이
  // 아니라 좁히기라서, 이상치로 좁히면 멀쩡한 후보가 조용히 사라진다 (ADR-0016).
  if (slot === 'gpu' && pcCase && filled(pcCase.expansionSlots) && pcCase.expansionSlots! > 0) {
    out.push({
      kind: 'atMost',
      key: 'total_slot_width',
      value: pcCase.expansionSlots,
      // 슬롯 자리에 mm를 적은 레코드가 4건 있다 (§15.2). 규칙이 판정 불가로 두는
      // 값이니 거르기도 숨기지 않는다.
      ignoreAbove: MAX_SANE_SLOT_WIDTH,
      ruleId: 15,
      because: `${pcCase.name}의 확장 슬롯 ${pcCase.expansionSlots}칸`,
    });
  }
  if (
    slot === 'pcCase' &&
    gpu &&
    gpu.chipOnly !== true &&
    filled(gpu.totalSlotWidth) &&
    gpu.totalSlotWidth! >= MIN_SANE_SLOT_WIDTH &&
    gpu.totalSlotWidth! <= MAX_SANE_SLOT_WIDTH
  ) {
    out.push({
      kind: 'atLeast',
      key: 'expansion_slots',
      value: Math.ceil(gpu.totalSlotWidth!),
      ruleId: 15,
      because: `${gpu.name}이 차지하는 ${Math.ceil(gpu.totalSlotWidth!)}칸`,
    });
  }

  // --- 규칙 17·19: 스토리지가 들어갈 자리 ---
  // 이미 고른 드라이브가 자리를 다 먹었으면 같은 자리를 쓰는 후보를 뺀다.
  // 규칙 18(SATA)은 포트 수가 두 키에 나뉘어 있어 제약 하나로 못 옮긴다.
  const m2Picked = storage.filter(usesM2Slot).length;
  const picked35 = storage.filter((d) => bayKind(d) === '3.5').length;
  if (slot === 'storage' && motherboard && filled(motherboard.m2Slots)) {
    // DDR5 보드의 0은 미입력이다 (§17.2). 그것으로 목록을 줄이지 않는다.
    const trustZero = motherboard.m2Slots! > 0 || motherboard.memoryType !== 'DDR5';
    if (trustZero && m2Picked >= motherboard.m2Slots!) {
      out.push({
        kind: 'oneOf',
        key: 'form_factor',
        values: NON_M2_FORM_FACTORS,
        ruleId: 17,
        because: `${motherboard.name}의 M.2 슬롯 ${motherboard.m2Slots}개를 이미 채웠습니다`,
      });
    }
  }
  if (slot === 'motherboard' && m2Picked > 0) {
    out.push({
      kind: 'atLeast',
      key: 'm2_slots',
      value: m2Picked,
      ruleId: 17,
      because: `고른 M.2 드라이브 ${m2Picked}개`,
    });
  }
  if (slot === 'pcCase' && picked35 > 0) {
    out.push({
      kind: 'atLeast',
      key: 'internal_3_5_bays',
      value: picked35,
      ruleId: 19,
      because: `고른 3.5" 드라이브 ${picked35}개`,
    });
  }

  // --- 규칙 5: 메인보드 폼팩터 ---
  if (slot === 'pcCase' && motherboard && filled(motherboard.formFactor)) {
    out.push({
      kind: 'contains',
      key: 'supported_mobo_form_factors',
      value: motherboard.formFactor,
      ruleId: 5,
      because: `${motherboard.name}의 폼팩터 ${motherboard.formFactor}`,
    });
  }
  if (slot === 'motherboard' && pcCase && filled(pcCase.supportedMoboFormFactors)) {
    out.push({
      kind: 'oneOf',
      key: 'form_factor',
      values: pcCase.supportedMoboFormFactors,
      ruleId: 5,
      because: `${pcCase.name}가 지원하는 폼팩터`,
    });
  }

  // --- 규칙 6: PSU 폼팩터 ---
  if (slot === 'psu' && pcCase && filled(pcCase.supportedPsuFormFactors)) {
    out.push({
      kind: 'oneOf',
      key: 'form_factor',
      values: pcCase.supportedPsuFormFactors,
      ruleId: 6,
      because: `${pcCase.name}가 지원하는 파워 규격`,
    });
  }
  if (slot === 'pcCase' && psu && filled(psu.formFactor)) {
    out.push({
      kind: 'contains',
      key: 'supported_psu_form_factors',
      value: psu.formFactor,
      ruleId: 6,
      because: `${psu.name}의 규격 ${psu.formFactor}`,
    });
  }

  // --- 규칙 9(쿨러 높이)에서는 제약을 만들지 않는다 ---
  //
  // 규칙 9는 **경고까지만** 낸다. 오류가 없다. 근거는 그 규칙 자신이 적어뒀다 —
  // "제조사의 최대 높이는 보수성이 제각각이고, 팬 위치를 옮겨 들어가는 사례가
  // 실재한다. 오류로 단정하면 쓸 수 있는 조합을 막는다" (docs/compat-rules.md §9.1).
  //
  // 목록에서 빼는 것은 단정보다 강하다. 사용자가 경고를 볼 기회조차 없어진다.
  // 실제로 NZXT H1처럼 한계가 45mm인 케이스에서 수랭 쿨러 대부분이 사라졌다 —
  // 저장된 height_mm가 라디에이터 높이라 그렇다. SFF에서 AIO를 찾는 사람이
  // 바로 그 경우다.
  //
  // **제약은 오류를 내는 규칙에서만 유도한다.** 테스트가 이 선을 고정한다.

  return out;
}
