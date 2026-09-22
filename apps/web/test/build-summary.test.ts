/**
 * 공유 링크 미리보기 한 줄.
 *
 * **없는 것을 지어내지 않는다.** 판정이 없으면 판정을 말하지 않고, 전력을
 * 계산할 수 없으면 전력을 말하지 않는다 — 빈 자리를 0으로 채우면 미리보기가
 * 거짓말을 한다. 링크를 받은 사람은 열어보기 전에 그것만 본다.
 *
 * 부품 픽스처는 **규칙 엔진의 것을 그대로 쓴다.** 손으로 만들면 덜 채워진
 * 객체가 되어 테스트만 엉뚱하게 깨진다 (실제로 규칙 8이 커넥터에서 터졌다).
 */

import { emptyBuild, evaluate } from '@buildfit/compat';
import { describe, expect, it } from 'vitest';
import { cpu, drive, gpu, goodBuild, ramKit, withBuild } from '../../../packages/compat/test/fixtures';
import { SLOT_META } from '../src/lib/categories';
import {
  buildLabel,
  buildSummary,
  filledSlotCount,
  nameOf,
  pickedCount,
} from '../src/lib/build-summary';

describe('알아볼 이름', () => {
  it('핵심 부품 두 개를 잇는다', () => {
    expect(buildLabel(goodBuild)).toBe(`${cpu.name} + ${gpu.name}`);
  });

  it('하나만 있으면 그것만', () => {
    expect(buildLabel({ ...emptyBuild, cpu })).toBe(cpu.name);
  });

  it('★ CPU·GPU가 없으면 아무거나 하나로 알아보게 한다', () => {
    // 메모리만 고른 링크도 「빈 견적」으로 보이면 안 된다.
    expect(buildLabel({ ...emptyBuild, ram: [ramKit] })).toBe(ramKit.name);
  });

  it('진짜 비면 빈 견적이다 — 미리보기가 기본 문구로 되돌아가는 신호다', () => {
    expect(buildLabel(emptyBuild)).toBe('빈 견적');
  });
});

describe('개수', () => {
  it('부품 수는 묶음마다 하나로 센다', () => {
    // CPU·보드·메모리·GPU·케이스·파워·쿨러·드라이브
    expect(pickedCount(goodBuild)).toBe(8);
    expect(pickedCount({ ...emptyBuild, cpu, gpu, ram: [ramKit] })).toBe(3);
    expect(pickedCount(emptyBuild)).toBe(0);
  });

  it('★ 칸 수는 메모리가 몇 묶음이든 하나다', () => {
    // 「4 / 7」의 분자에 부품 수를 쓰면 묶음이 늘 때 분모를 넘는다.
    const many = { ...emptyBuild, ram: [ramKit, { ...ramKit, id: 'ram-2' }] };
    expect(pickedCount(many)).toBe(2);
    expect(filledSlotCount(many)).toBe(1);
  });

  it('★ 칸 수가 칸 개수를 넘지 않는다', () => {
    const full = {
      ...goodBuild,
      ram: [ramKit, { ...ramKit, id: 'r2' }, { ...ramKit, id: 'r3' }, { ...ramKit, id: 'r4' }],
    };
    expect(pickedCount(full)).toBe(11);
    // 칸은 여덟 개뿐이다.
    expect(filledSlotCount(full)).toBe(8);
    expect(filledSlotCount(full)).toBeLessThanOrEqual(SLOT_META.length);
  });

  it('★ 스토리지도 몇 개든 한 칸이다', () => {
    const many = {
      ...emptyBuild,
      storage: [drive, { ...drive, id: 'd2' }, { ...drive, id: 'd3' }],
    };
    expect(pickedCount(many)).toBe(3);
    expect(filledSlotCount(many)).toBe(1);
  });
});

describe('요약 한 줄', () => {
  it('판정과 전력과 개수를 잇는다', () => {
    const s = buildSummary(goodBuild, evaluate(goodBuild));
    expect(s).toMatch(/통과 \d/);
    expect(s).toMatch(/소비전력 \d+~\d+W/);
    expect(s).toContain('부품 8개');
  });

  it('★ 판정이 없으면 판정을 말하지 않는다', () => {
    // 부품 하나로는 규칙이 하나도 돌지 않는다. 「통과 0」은 거짓 인상을 준다.
    const b = { ...emptyBuild, cpu };
    const s = buildSummary(b, evaluate(b));
    expect(s).not.toContain('통과');
    expect(s).toContain('부품 1개');
  });

  it('★ 전력을 셀 수 없으면 전력을 말하지 않는다', () => {
    // CPU도 GPU도 없으면 합계를 낼 근거가 없다. 0W라고 적으면 거짓이다.
    const b = { ...emptyBuild, ram: [ramKit] };
    const s = buildSummary(b, evaluate(b));
    expect(s).not.toContain('소비전력');
    expect(s).not.toContain('0~0W');
  });

  it('0건을 적지 않는다 — 「문제 0」은 문제가 있는 것처럼 읽힌다', () => {
    const s = buildSummary(goodBuild, evaluate(goodBuild));
    if (!s.includes('문제')) expect(s).not.toContain('문제 0');
    if (!s.includes('판정 불가')) expect(s).not.toContain('판정 불가 0');
  });

  it('★ 문제가 있으면 미리보기에 드러난다 — 그게 이 도구의 요점이다', () => {
    // 소켓이 어긋난 조합. 링크를 받은 사람이 열기 전에 알아야 한다.
    const b = withBuild({ cpu: { ...cpu, socket: 'LGA1700' } });
    expect(buildSummary(b, evaluate(b))).toMatch(/문제 [1-9]/);
  });

  it('빈 견적도 던지지 않는다', () => {
    expect(buildSummary(emptyBuild, evaluate(emptyBuild))).toBe('부품 0개');
  });
});

describe('한 칸을 한 줄로', () => {
  it('하나면 이름만', () => {
    expect(nameOf(goodBuild, 'cpu')).toBe(cpu.name);
  });

  it('★ 여럿이면 몇 개인지 말한다 — 지우지 않는다', () => {
    const two = { ...emptyBuild, ram: [ramKit, { ...ramKit, id: 'r2' }] };
    expect(nameOf(two, 'ram')).toBe(`${ramKit.name} 외 1개`);
  });

  it('비면 null', () => {
    expect(nameOf(emptyBuild, 'storage')).toBeNull();
  });
});
