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
 */

import type { PartSlot } from './applicability';
import type { Build } from './parts';

/** 후보의 `part_specs.key`에 걸리는 조건. DB 계층이 SQL로 옮긴다. */
export type Constraint =
  /** 그 키의 값이 `value`와 달라야 제외 */
  | { readonly kind: 'equals'; readonly key: string; readonly value: string; readonly ruleId: number; readonly because: string }
  /** 그 키의 값이 `values` 중 어느 것도 아니면 제외 */
  | { readonly kind: 'oneOf'; readonly key: string; readonly values: readonly string[]; readonly ruleId: number; readonly because: string }
  /** 배열 스펙이 `value`를 포함하지 않으면 제외 */
  | { readonly kind: 'contains'; readonly key: string; readonly value: string; readonly ruleId: number; readonly because: string }
  /** 숫자 스펙이 `value`보다 크면 제외 */
  | { readonly kind: 'atMost'; readonly key: string; readonly value: number; readonly ruleId: number; readonly because: string }
  /** 숫자 스펙이 `value`보다 작으면 제외 */
  | { readonly kind: 'atLeast'; readonly key: string; readonly value: number; readonly ruleId: number; readonly because: string };

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
  const { cpu, motherboard, gpu, pcCase, psu, cooler } = build;

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

  // --- 규칙 9: 쿨러 높이 ---
  // 수랭은 높이가 관건이 아니다 (규칙 9.2)
  if (slot === 'cooler' && pcCase && filled(pcCase.maxCpuCoolerHeightMm)) {
    out.push({
      kind: 'atMost',
      key: 'height_mm',
      value: pcCase.maxCpuCoolerHeightMm,
      ruleId: 9,
      because: `${pcCase.name}의 쿨러 한계 ${pcCase.maxCpuCoolerHeightMm}mm`,
    });
  }
  if (slot === 'pcCase' && cooler && cooler.waterCooled !== true && filled(cooler.heightMm)) {
    out.push({
      kind: 'atLeast',
      key: 'max_cpu_cooler_height_mm',
      value: cooler.heightMm,
      ruleId: 9,
      because: `${cooler.name} 높이 ${cooler.heightMm}mm`,
    });
  }

  return out;
}
