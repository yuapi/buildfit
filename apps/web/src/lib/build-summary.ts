/**
 * 견적을 한 줄로 요약한다.
 *
 * 공유 링크가 이 도구의 주된 전파 경로인데, 카카오톡·디스코드에 붙이면
 * **「공유된 견적」이라는 같은 미리보기**만 떴다. 무엇이 들어 있는지도,
 * 판정이 어떻게 났는지도 안 보인다.
 *
 * 화면과 **같은 함수**로 만든다. 미리보기에 「통과 9」라고 적혔는데 열어보니
 * 다르면 그게 더 나쁘다.
 */

import { type Build, type BuildVerdict, estimatePower } from '@buildfit/compat';
import { SLOT_META, type SlotName } from './categories';

/** 한 칸에 들어 있는 부품들. 메모리·스토리지는 여럿일 수 있다. */
export function partsInSlot(build: Build, slot: SlotName) {
  if (slot === 'ram') return build.ram;
  if (slot === 'storage') return build.storage;
  const one = build[slot];
  return one ? [one] : [];
}

/**
 * 한 칸을 한 줄로. 여럿이면 **몇 개인지 말한다.**
 *
 * 첫 번째만 적고 나머지를 지우면, 두 묶음을 담은 견적을 공유했는데 미리보기가
 * 한 묶음짜리처럼 보인다.
 */
export function nameOf(build: Build, slot: SlotName): string | null {
  const parts = partsInSlot(build, slot);
  const first = parts[0]?.name;
  if (!first) return null;
  return parts.length > 1 ? `${first} 외 ${parts.length - 1}개` : first;
}

/**
 * 이 견적을 알아볼 이름. 핵심 부품 두 개면 대개 알아본다.
 *
 * 저장 목록·최근 구성·공유 미리보기가 **같은 이름**을 쓴다.
 */
export function buildLabel(build: Build): string {
  const picked = [build.cpu?.name, build.gpu?.name].filter(Boolean) as string[];
  if (picked.length > 0) return picked.join(' + ');
  const any = SLOT_META.map((m) => nameOf(build, m.slot)).find(Boolean);
  return any ?? '빈 견적';
}

/** 고른 부품 개수. 메모리·스토리지는 하나하나 센다 */
export function pickedCount(build: Build): number {
  return (
    [build.cpu, build.motherboard, build.gpu, build.pcCase, build.psu, build.cooler].filter(Boolean)
      .length +
    build.ram.length +
    build.storage.length
  );
}

/**
 * 채운 **칸** 수. 메모리·스토리지는 몇 개든 한 칸이다.
 *
 * 「4 / 7」처럼 칸 수를 분모로 쓰는 자리에서는 이쪽을 써야 한다.
 * 부품 수를 쓰면 메모리를 여러 묶음 넣었을 때 **분자가 분모를 넘는다**
 * (묶음 4 + 나머지 6 = 10 / 7).
 */
export function filledSlotCount(build: Build): number {
  return (
    [build.cpu, build.motherboard, build.gpu, build.pcCase, build.psu, build.cooler].filter(Boolean)
      .length +
    (build.ram.length > 0 ? 1 : 0) +
    (build.storage.length > 0 ? 1 : 0)
  );
}

/**
 * 미리보기에 쓸 한 줄.
 *
 * **없는 것을 지어내지 않는다.** 판정이 없으면 판정을 말하지 않고, 전력을
 * 계산할 수 없으면 전력을 말하지 않는다 — 빈 자리를 0으로 채우면 거짓이 된다.
 */
export function buildSummary(build: Build, verdict: BuildVerdict): string {
  const bits: string[] = [];

  const counts = verdict.counts;
  if (counts.pass + counts.fail + counts.unknown > 0) {
    const parts = [`통과 ${counts.pass}`];
    if (counts.fail > 0) parts.push(`문제 ${counts.fail}`);
    if (counts.unknown > 0) parts.push(`판정 불가 ${counts.unknown}`);
    bits.push(parts.join(' · '));
  }

  // 규칙 7과 같은 함수다. 두 벌이 되면 미리보기와 화면이 어긋난다.
  const cpuW = build.cpu ? (build.cpu.ppt ?? build.cpu.tdp) : null;
  const gpuW = build.gpu?.tdp ?? null;
  if (cpuW !== null || gpuW !== null) {
    const est = estimatePower({
      cpuW,
      gpuW,
      ramModules: build.ram.reduce((n, k) => n + (k.moduleCount ?? 0), 0),
      storageCount: build.storage.length,
    });
    bits.push(`소비전력 ${est.minW}~${est.maxW}W`);
  }

  bits.push(`부품 ${pickedCount(build)}개`);
  return bits.join(' · ');
}
