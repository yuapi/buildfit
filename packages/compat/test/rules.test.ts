/**
 * 규칙 엔진 회귀 테스트.
 *
 * 구성은 docs/compat-rules.md §13의 체크리스트를 따른다.
 * - 규칙마다 pass / fail
 * - 규칙마다 필요 필드를 null로 비운 unknown
 * - 규칙 8의 모순 케이스 ★ 결측 검사로는 잡히지 않는다
 * - 규칙 4의 경계 케이스
 */

import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/engine';
import { emptyBuild } from '../src/parts';
import { estimatePower } from '../src/power';
import {
  rule1, rule2, rule3, rule4, rule5, rule6, rule7, rule8, rule9,
  rule12, rule15, rule16, rule17, rule18, rule19,
} from '../src/rules';
import * as f from './fixtures';

describe('1. CPU 소켓 = 메인보드 소켓', () => {
  it('일치하면 pass', () => {
    expect(rule1(f.goodBuild)?.verdict).toBe('pass');
  });

  it('다르면 오류', () => {
    const r = rule1(f.withBuild({ motherboard: { ...f.motherboard, socket: 'LGA1700' } }));
    expect(r?.verdict).toBe('fail');
    expect(r?.severity).toBe('error');
  });

  it('소켓이 없으면 판정 불가', () => {
    const r = rule1(f.withBuild({ cpu: { ...f.cpu, socket: null } }));
    expect(r?.verdict).toBe('unknown');
    expect(r?.reason?.kind).toBe('missing');
    expect(r?.reason?.fields[0]?.part).toBe(f.cpu.name);
  });

  it('부품을 아직 고르지 않았으면 규칙이 적용되지 않는다', () => {
    expect(rule1(f.withBuild({ cpu: null }))).toBeNull();
  });
});

describe('2. 메모리 규격 일치', () => {
  it('일치하면 pass', () => {
    expect(rule2(f.goodBuild)?.verdict).toBe('pass');
  });

  it('메인보드와 다르면 오류', () => {
    const r = rule2(f.withBuild({ ram: [{ ...f.ramKit, ramType: 'DDR4' }] }));
    expect(r?.verdict).toBe('fail');
  });

  it('CPU가 지원하지 않으면 오류', () => {
    const r = rule2(f.withBuild({ cpu: { ...f.cpu, memoryTypes: ['DDR4'] } }));
    expect(r?.verdict).toBe('fail');
  });

  it('CPU 쪽 결측은 전체를 판정 불가로 만들지 않고 건너뛴 사실만 남긴다', () => {
    const r = rule2(f.withBuild({ cpu: { ...f.cpu, memoryTypes: null } }));
    expect(r?.verdict).toBe('pass');
    expect(r?.skipped).toHaveLength(1);
  });

  it('메인보드 쪽 결측이면 판정 불가', () => {
    const r = rule2(f.withBuild({ motherboard: { ...f.motherboard, memoryType: null } }));
    expect(r?.verdict).toBe('unknown');
  });
});

describe('3. 메모리 모듈 수 ≤ 슬롯 수', () => {
  it('슬롯 안에 들어가면 pass', () => {
    expect(rule3(f.goodBuild)?.verdict).toBe('pass');
  });

  it('여러 키트를 합산한다', () => {
    const r = rule3(f.withBuild({ ram: [f.ramKit, f.ramKit, f.ramKit] })); // 2*3 = 6 > 4
    expect(r?.verdict).toBe('fail');
  });

  it('슬롯 수와 정확히 같으면 pass', () => {
    const r = rule3(f.withBuild({ ram: [{ ...f.ramKit, moduleCount: 4 }] }));
    expect(r?.verdict).toBe('pass');
  });

  it('슬롯 수가 없으면 판정 불가', () => {
    const r = rule3(f.withBuild({ motherboard: { ...f.motherboard, memorySlots: null } }));
    expect(r?.verdict).toBe('unknown');
  });
});

describe('4. GPU 길이 ≤ 케이스 최대 길이', () => {
  it('여유가 있으면 pass', () => {
    expect(rule4(f.goodBuild)?.verdict).toBe('pass');
  });

  it('한계를 넘으면 오류', () => {
    const r = rule4(f.withBuild({ pcCase: { ...f.pcCase, maxGpuLengthMm: 300 } }));
    expect(r?.verdict).toBe('fail');
    expect(r?.severity).toBe('error');
  });

  it('95%를 넘고 한계 이하면 경고', () => {
    // 한계 340mm, 95% = 323mm. 330mm는 경고 구간.
    const r = rule4(
      f.withBuild({
        gpu: { ...f.gpu, lengthMm: 330 },
        pcCase: { ...f.pcCase, maxGpuLengthMm: 340 },
      }),
    );
    expect(r?.verdict).toBe('fail');
    expect(r?.severity).toBe('warning');
  });

  it('경계: 정확히 95%면 아직 pass', () => {
    const r = rule4(
      f.withBuild({
        gpu: { ...f.gpu, lengthMm: 323 },
        pcCase: { ...f.pcCase, maxGpuLengthMm: 340 },
      }),
    );
    expect(r?.verdict).toBe('pass');
  });

  it('경계: 정확히 한계면 경고이지 오류가 아니다', () => {
    const r = rule4(
      f.withBuild({
        gpu: { ...f.gpu, lengthMm: 340 },
        pcCase: { ...f.pcCase, maxGpuLengthMm: 340 },
      }),
    );
    expect(r?.verdict).toBe('fail');
    expect(r?.severity).toBe('warning');
  });

  it('칩만 고르면 단정하지 않고 판정 불가 + 범위 안내', () => {
    const r = rule4(
      f.withBuild({
        gpu: { ...f.gpu, chipOnly: true, chipset: 'GeForce RTX 4070', chipLengthRangeMm: [201, 342] },
      }),
    );
    expect(r?.verdict).toBe('unknown');
    expect(r?.message).toContain('201~342mm');
  });

  it('케이스 한계가 없으면 판정 불가', () => {
    const r = rule4(f.withBuild({ pcCase: { ...f.pcCase, maxGpuLengthMm: null } }));
    expect(r?.verdict).toBe('unknown');
  });
});

describe('5. 메인보드 폼팩터 ⊂ 케이스 지원', () => {
  it('지원 목록에 있으면 pass', () => {
    expect(rule5(f.goodBuild)?.verdict).toBe('pass');
  });

  it('지원 목록에 없으면 오류', () => {
    const r = rule5(f.withBuild({ motherboard: { ...f.motherboard, formFactor: 'HPTX' } }));
    expect(r?.verdict).toBe('fail');
  });

  it('하위 호환을 추론하지 않는다 — 목록에 없으면 ATX 케이스라도 fail', () => {
    const r = rule5(
      f.withBuild({
        motherboard: { ...f.motherboard, formFactor: 'Micro ATX' },
        pcCase: { ...f.pcCase, supportedMoboFormFactors: ['ATX'] },
      }),
    );
    expect(r?.verdict).toBe('fail');
  });

  it('지원 목록이 없으면 판정 불가', () => {
    const r = rule5(f.withBuild({ pcCase: { ...f.pcCase, supportedMoboFormFactors: null } }));
    expect(r?.verdict).toBe('unknown');
  });
});

describe('6. PSU 폼팩터 ⊂ 케이스 지원', () => {
  it('지원하면 pass', () => {
    expect(rule6(f.goodBuild)?.verdict).toBe('pass');
  });

  it('지원하지 않으면 오류', () => {
    const r = rule6(
      f.withBuild({ pcCase: { ...f.pcCase, supportedPsuFormFactors: ['SFX', 'SFX-L'] } }),
    );
    expect(r?.verdict).toBe('fail');
  });

  it('케이스 정보가 없으면 판정 불가 — 현행 세대 케이스의 83%가 여기 해당한다', () => {
    const r = rule6(f.withBuild({ pcCase: { ...f.pcCase, supportedPsuFormFactors: null } }));
    expect(r?.verdict).toBe('unknown');
    expect(r?.reason?.kind).toBe('missing');
  });

  it('빈 배열도 결측으로 본다', () => {
    const r = rule6(f.withBuild({ pcCase: { ...f.pcCase, supportedPsuFormFactors: [] } }));
    expect(r?.verdict).toBe('unknown');
  });

  // ADR-0013: 판정 불가에 관측된 분포를 덧붙인다. 판정 자체는 바뀌지 않는다.
  describe('참고 분포 (ADR-0013)', () => {
    const blind = (formFactor: string | null) =>
      rule6(f.withBuild({ pcCase: { ...f.pcCase, formFactor, supportedPsuFormFactors: null } }));

    it('표본이 충분한 폼팩터면 참고 분포를 덧붙인다', () => {
      const r = blind('Mini ITX Tower');
      expect(r?.verdict).toBe('unknown');
      expect(r?.notes?.[0]).toContain('SFX 14건(82%)');
      expect(r?.notes?.[0]).toContain('17건');
    });

    it('참고 분포는 이 케이스의 사양이 아님을 문장 안에서 밝힌다', () => {
      expect(blind('ATX Mid Tower')?.notes?.[0]).toContain('이 케이스의 사양이 아니라');
    });

    it('표본 10건 미만이면 인용하지 않는다', () => {
      // ATX Mini Tower는 4건뿐이라 표에 싣지 않았다
      expect(blind('ATX Mini Tower')?.notes).toBeUndefined();
    });

    it('데이터가 없는 폼팩터면 인용하지 않는다', () => {
      expect(blind('HTPC')?.notes).toBeUndefined();
      expect(blind(null)?.notes).toBeUndefined();
    });

    it('참고 분포가 판정을 pass로 바꾸지 않는다 — 거짓 통과 방지', () => {
      // ATX Mid Tower는 관측 99%가 ATX다. 그래도 통과시키지 않는다
      const r = blind('ATX Mid Tower');
      expect(r?.verdict).toBe('unknown');
      expect(r?.reason?.kind).toBe('missing');
    });

    it('값이 채워져 있으면 참고 분포를 붙이지 않는다', () => {
      const r = rule6(f.withBuild({ pcCase: { ...f.pcCase, formFactor: 'Mini ITX Tower' } }));
      expect(r?.verdict).toBe('pass');
      expect(r?.notes).toBeUndefined();
    });
  });
});

describe('7. 소비전력 대비 PSU 정격 — 구간 판정', () => {
  // 기준 견적: CPU PPT 162W + GPU TDP 360W = 522W, 메모리 2모듈
  //   총_최소  = 522 + 25 + 2×2 = 551W
  //   총_최대  = 522 + 80 + 5×2 = 612W
  //   권장정격 = ceil(612 × 1.3) = 796W
  const withPsu = (wattage: number | null) =>
    f.withBuild({ psu: { ...f.psu, wattage } });

  it('권장 정격 이상이면 통과', () => {
    const r = rule7(withPsu(850));
    expect(r?.verdict).toBe('pass');
  });

  it('경계: 권장 정격과 정확히 같으면 통과', () => {
    expect(rule7(withPsu(796))?.verdict).toBe('pass');
  });

  it('경계: 권장 정격보다 1W 낮으면 경고', () => {
    const r = rule7(withPsu(795));
    expect(r?.verdict).toBe('fail');
    expect(r?.severity).toBe('warning');
  });

  it('경계: 총 최소와 정확히 같으면 경고이지 오류가 아니다', () => {
    const r = rule7(withPsu(551));
    expect(r?.verdict).toBe('fail');
    expect(r?.severity).toBe('warning');
  });

  it('총 최소보다 낮으면 오류', () => {
    const r = rule7(withPsu(550));
    expect(r?.verdict).toBe('fail');
    expect(r?.severity).toBe('error');
  });

  it('추정 구간을 메시지에 낸다 — 단일 수치를 내놓지 않는다', () => {
    expect(rule7(withPsu(850))?.message).toContain('551~612W');
  });

  it('가정 범위와 출처를 결과에 싣는다 (§7.4)', () => {
    // 드라이브가 없으면 가정 설명 한 줄뿐이다. 있으면 빠진 부품이 앞에 붙는다 (§7.4.1)
    const notes = rule7(f.withBuild({ psu: { ...f.psu, wattage: 850 }, storage: [] }))?.notes ?? [];
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('메인보드 25~80W');
    expect(notes[0]).toContain('메모리 모듈당 2~5W');
    expect(notes[0]).toContain('Seasonic');
  });

  it('1차 출처 미확인 상태를 숨기지 않는다', () => {
    const notes = rule7(withPsu(850))?.notes?.join(' ') ?? '';
    expect(notes).toContain('원문 미확인');
  });

  it('GPU를 고르지 않으면 GPU 전력 없이 계산한다 (내장그래픽 구성)', () => {
    // 522 → 162W 기준. 총_최소 = 162+25+4 = 191, 총_최대 = 162+80+10 = 252, 권장 328
    const r = rule7(f.withBuild({ gpu: null, psu: { ...f.psu, wattage: 400 } }));
    expect(r?.verdict).toBe('pass');
    expect(r?.message).toContain('191~252W');
  });

  it('CPU는 PPT가 있으면 TDP 대신 PPT를 쓴다', () => {
    const withTdpOnly = rule7(
      f.withBuild({ cpu: { ...f.cpu, ppt: null }, psu: { ...f.psu, wattage: 850 } }),
    );
    // PPT 162 대신 TDP 120 → 총_최소 509
    expect(withTdpOnly?.message).toContain('509~570W');
  });

  it('소비전력 정보가 없으면 판정 불가', () => {
    const r = rule7(f.withBuild({ cpu: { ...f.cpu, tdp: null, ppt: null } }));
    expect(r?.verdict).toBe('unknown');
    expect(r?.reason?.fields[0]?.field).toContain('소비전력');
  });

  it('PSU 정격이 없으면 판정 불가', () => {
    expect(rule7(withPsu(null))?.verdict).toBe('unknown');
  });
});

describe('8. PCIe 보조전원 커넥터', () => {
  it('충족하면 pass', () => {
    expect(rule8(f.goodBuild)?.verdict).toBe('pass');
  });

  it('16핀이 부족하면 오류', () => {
    const r = rule8(f.withBuild({ psu: { ...f.psu, connectors: { pcie6plus2: 4, pcie12vhpwr: 0 } } }));
    expect(r?.verdict).toBe('fail');
  });

  it('GPU 6핀과 8핀을 합쳐 PSU 6+2핀과 비교한다', () => {
    const r = rule8(
      f.withBuild({
        gpu: { ...f.gpu, tdp: 200, connectors: { pcie6: 1, pcie8: 2, pcie12vhpwr: 0, pcie12v2x6: 0 } },
        psu: { ...f.psu, connectors: { pcie6plus2: 3, pcie12vhpwr: 0 } },
      }),
    );
    expect(r?.verdict).toBe('pass');
  });

  it('12V-2x6을 12VHPWR과 같은 16핀으로 합산한다', () => {
    const r = rule8(
      f.withBuild({
        gpu: { ...f.gpu, connectors: { pcie6: 0, pcie8: 0, pcie12vhpwr: 0, pcie12v2x6: 1 } },
      }),
    );
    expect(r?.verdict).toBe('pass');
  });

  it('★ TDP가 75W를 넘는데 커넥터가 전부 0이면 모순으로 판정 불가', () => {
    // OpenDB 실제 데이터 문제. RTX 40/50 중 166건이 여기 해당한다.
    // null이 아니라 0이므로 결측 검사로는 잡히지 않는다.
    const r = rule8(
      f.withBuild({
        gpu: {
          ...f.gpu,
          name: 'Inno3D GeForce RTX 5090 X3 32GB',
          tdp: 575,
          connectors: { pcie6: 0, pcie8: 0, pcie12vhpwr: 0, pcie12v2x6: 0 },
        },
      }),
    );
    expect(r?.verdict).toBe('unknown');
    expect(r?.reason?.kind).toBe('inconsistent');
  });

  it('TDP가 75W 이하면 커넥터 0이 정상이다', () => {
    const r = rule8(
      f.withBuild({
        gpu: { ...f.gpu, tdp: 70, connectors: { pcie6: 0, pcie8: 0, pcie12vhpwr: 0, pcie12v2x6: 0 } },
      }),
    );
    expect(r?.verdict).toBe('pass');
  });

  it('커넥터가 null이면 0으로 간주하지 않고 판정 불가', () => {
    const r = rule8(
      f.withBuild({
        gpu: { ...f.gpu, connectors: { pcie6: null, pcie8: 0, pcie12vhpwr: 1, pcie12v2x6: 0 } },
      }),
    );
    expect(r?.verdict).toBe('unknown');
    expect(r?.reason?.kind).toBe('missing');
  });

  it('12VHPWR과 12V-2x6이 동시에 기입되면 중복으로 보고 판정 불가', () => {
    const r = rule8(
      f.withBuild({
        gpu: { ...f.gpu, connectors: { pcie6: 0, pcie8: 0, pcie12vhpwr: 1, pcie12v2x6: 1 } },
      }),
    );
    expect(r?.verdict).toBe('unknown');
    expect(r?.reason?.kind).toBe('inconsistent');
  });
});

describe('9. CPU 쿨러 높이 ≤ 케이스 최대 높이 (Phase 1)', () => {
  it('한계 안이면 pass', () => {
    // 기준 견적: 쿨러 160mm / 케이스 한계 167mm
    const r = rule9(f.goodBuild);
    expect(r?.verdict).toBe('pass');
  });

  it('정확히 같으면 pass — 경계는 들어가는 쪽이다', () => {
    const r = rule9(f.withBuild({ cooler: { ...f.cooler, heightMm: 167 } }));
    expect(r?.verdict).toBe('pass');
  });

  it('넘으면 오류가 아니라 경고다', () => {
    const r = rule9(f.withBuild({ cooler: { ...f.cooler, heightMm: 200 } }));
    expect(r?.verdict).toBe('fail');
    expect(r?.severity).toBe('warning');
  });

  it('수랭이면 판정하지 않고 건너뛴 사실을 남긴다', () => {
    const r = rule9(f.withBuild({ cooler: { ...f.cooler, waterCooled: true } }));
    expect(r?.verdict).toBe('unknown');
    expect(r?.skipped?.length).toBeGreaterThan(0);
  });

  it('수랭 쿨러를 통과로 표시하지 않는다 — 라디에이터는 아무도 확인하지 않았다', () => {
    const r = rule9(f.withBuild({ cooler: { ...f.cooler, waterCooled: true, heightMm: 50 } }));
    expect(r?.verdict).not.toBe('pass');
  });

  it('수랭 여부가 없으면 높이가 있어도 판정 불가', () => {
    const r = rule9(f.withBuild({ cooler: { ...f.cooler, waterCooled: null } }));
    expect(r?.verdict).toBe('unknown');
    expect(r?.reason?.fields[0]?.field).toBe('수랭 여부');
  });

  it('쿨러 높이가 없으면 판정 불가', () => {
    const r = rule9(f.withBuild({ cooler: { ...f.cooler, heightMm: null } }));
    expect(r?.verdict).toBe('unknown');
    expect(r?.reason?.kind).toBe('missing');
  });

  it('케이스 한계가 없으면 판정 불가 — 케이스의 35.2%만 채워져 있다', () => {
    const r = rule9(f.withBuild({ pcCase: { ...f.pcCase, maxCpuCoolerHeightMm: null } }));
    expect(r?.verdict).toBe('unknown');
  });

  it('쿨러를 고르지 않았으면 규칙이 적용되지 않는다', () => {
    expect(rule9(f.withBuild({ cooler: null }))).toBeNull();
  });

  it('빠듯해도 경고로 올리지 않는다 — 근거 없는 정밀도를 주장하지 않는다', () => {
    const r = rule9(f.withBuild({ cooler: { ...f.cooler, heightMm: 166 } }));
    expect(r?.verdict).toBe('pass');
  });
});

describe('12. BIOS 업데이트 필요 여부 (Phase 1)', () => {
  const mb = (patch: Partial<typeof f.motherboard>) =>
    f.withBuild({ motherboard: { ...f.motherboard, ...patch } });

  it('보드가 CPU와 같은 해면 pass', () => {
    // 기준 견적: CPU 2024 / 보드 2024
    expect(rule12(f.goodBuild)?.verdict).toBe('pass');
  });

  it('보드가 더 나중이면 pass — 헛경고를 만들지 않는다', () => {
    expect(rule12(mb({ releaseYear: 2025 }))?.verdict).toBe('pass');
  });

  it('CPU가 더 나중이고 Flashback이 없으면 경고', () => {
    const r = rule12(mb({ releaseYear: 2022, biosFlashback: false }));
    expect(r?.verdict).toBe('fail');
    expect(r?.severity).toBe('warning');
    expect(r?.message).toContain('다른 CPU가 필요');
  });

  it('CPU가 더 나중이어도 Flashback이 있으면 정보 등급', () => {
    const r = rule12(mb({ releaseYear: 2022, biosFlashback: true }));
    expect(r?.verdict).toBe('fail');
    expect(r?.severity).toBe('info');
    expect(r?.message).toContain('Flashback');
  });

  it('Flashback이 결측이면 심각한 쪽으로 가정하지 않고 판정 불가', () => {
    const r = rule12(mb({ releaseYear: 2022, biosFlashback: null }));
    expect(r?.verdict).toBe('unknown');
    expect(r?.reason?.fields[0]?.field).toBe('BIOS Flashback');
  });

  it('Flashback 결측이라도 연도가 문제없으면 판정한다 — 불필요하게 막지 않는다', () => {
    expect(rule12(mb({ releaseYear: 2024, biosFlashback: null }))?.verdict).toBe('pass');
  });

  it('보드 연도가 없으면 판정 불가 — 전수의 79.6%가 여기 해당한다', () => {
    const r = rule12(mb({ releaseYear: null }));
    expect(r?.verdict).toBe('unknown');
    expect(r?.reason?.kind).toBe('missing');
  });

  it('CPU 연도가 없어도 판정 불가', () => {
    const r = rule12(f.withBuild({ cpu: { ...f.cpu, releaseYear: null } }));
    expect(r?.verdict).toBe('unknown');
  });

  it('부품을 고르지 않았으면 규칙이 적용되지 않는다', () => {
    expect(rule12(f.withBuild({ motherboard: null }))).toBeNull();
  });
});

describe('15. GPU 두께(슬롯) ≤ 케이스 확장 슬롯 수 (Phase 1)', () => {
  const build = (width: number | null, slots: number | null) =>
    f.withBuild({
      gpu: { ...f.gpu, totalSlotWidth: width },
      pcCase: { ...f.pcCase, expansionSlots: slots },
    });

  it('들어가면 pass', () => {
    // 2.5슬롯 카드가 8칸짜리 케이스에. 필요 3칸
    expect(rule15(f.goodBuild)?.verdict).toBe('pass');
  });

  it('pass에도 한계를 적는다 — 통과가 "확인됨"이 아니다 (§15.3)', () => {
    const r = rule15(f.goodBuild);
    expect(r?.notes?.join(' ')).toContain('x16 슬롯 위치');
  });

  it('두께가 슬롯 수를 넘으면 error', () => {
    const r = rule15(build(4, 2));
    expect(r?.verdict).toBe('fail');
    expect(r?.severity).toBe('error');
    expect(r?.message).toContain('4칸');
    expect(r?.message).toContain('2칸');
  });

  it('★ 브래킷이 아니라 쿨러 기준이다 — 2.5슬롯은 3칸을 먹는다 (§15.1)', () => {
    // 2.5 ≤ 2가 아니므로 당연히 실패지만, 경계는 2.5 vs 3이다
    expect(rule15(build(2.5, 2))?.verdict).toBe('fail');
    expect(rule15(build(2.5, 3))?.verdict).toBe('pass');
    // 정확히 3슬롯 카드는 3칸에 들어간다. ceil이 3을 4로 올리지 않는다
    expect(rule15(build(3, 3))?.verdict).toBe('pass');
  });

  it('한쪽이라도 결측이면 unknown', () => {
    expect(rule15(build(null, 8))?.verdict).toBe('unknown');
    expect(rule15(build(2.5, null))?.verdict).toBe('unknown');
    expect(rule15(build(null, null))?.reason?.fields).toHaveLength(2);
  });

  it('★ 슬롯 자리에 mm가 들어간 값은 판정하지 않는다 (§15.2)', () => {
    // 실재하는 4건: 120 · 77 · 55.6 · 44
    for (const bad of [120, 77, 55.6, 44]) {
      const r = rule15(build(bad, 7));
      expect(r?.verdict, `${bad}슬롯`).toBe('unknown');
      expect(r?.reason?.kind).toBe('out-of-range');
    }
    // 이 값들을 그대로 믿으면 멀쩡한 ATX 미드타워가 전부 오류로 뜬다
    expect(rule15(build(120, 7))?.severity).not.toBe('error');
  });

  it('★ 확장 슬롯 0은 미입력이다. 그대로 믿지 않는다 (§15.2)', () => {
    const r = rule15(build(2.5, 0));
    expect(r?.verdict).toBe('unknown');
    expect(r?.reason?.kind).toBe('out-of-range');
    // 0을 그대로 쓰면 모든 GPU가 오류가 된다
    expect(r?.message).not.toContain('들어가지 않습니다');
  });

  it('정상 범위의 양 끝은 판정한다', () => {
    expect(rule15(build(1, 1))?.verdict).toBe('pass');
    expect(rule15(build(5, 5))?.verdict).toBe('pass');
    expect(rule15(build(5, 4))?.verdict).toBe('fail');
  });

  it('칩만 고른 경우 두께를 단정하지 않는다', () => {
    const r = rule15(
      f.withBuild({ gpu: { ...f.gpu, chipOnly: true, totalSlotWidth: null } }),
    );
    expect(r?.verdict).toBe('unknown');
    expect(r?.message).toContain('모델');
  });

  it('부품을 안 골랐으면 null — 판정 불가와 다르다', () => {
    expect(rule15(f.withBuild({ gpu: null }))).toBeNull();
    expect(rule15(f.withBuild({ pcCase: null }))).toBeNull();
  });
});

describe('16. 총 메모리 용량 ≤ 보드·CPU 최대 (Phase 1)', () => {
  const build = (capGb: number | null, boardMax: number | null, cpuMax: number | null, slots = 4) =>
    f.withBuild({
      ram: [{ ...f.ramKit, capacityGb: capGb }],
      motherboard: { ...f.motherboard, memoryMaxGb: boardMax, memorySlots: slots },
      cpu: { ...f.cpu, memoryMaxGb: cpuMax },
    });

  it('한계 안이면 pass', () => {
    expect(rule16(f.goodBuild)?.verdict).toBe('pass');
  });

  it('넘으면 경고 — 오류가 아니다 (§16.3)', () => {
    const r = rule16(build(192, 128, 256));
    expect(r?.verdict).toBe('fail');
    expect(r?.severity).toBe('warning');
    expect(r?.message).toContain('192GB');
    expect(r?.message).toContain('128GB');
    // "안 된다"가 아니라 "확인이 필요하다"로 말한다
    expect(r?.message).toContain('BIOS');
  });

  it('★ 키트를 여럿 담으면 합산한다 — 규칙 3과 같다', () => {
    const two = f.withBuild({
      ram: [
        { ...f.ramKit, id: 'a', capacityGb: 64 },
        { ...f.ramKit, id: 'b', capacityGb: 64 },
      ],
      motherboard: { ...f.motherboard, memoryMaxGb: 128 },
      cpu: { ...f.cpu, memoryMaxGb: 96 },
    });
    // 합계 128 > CPU 96. 킷 하나만 보면 64라서 통과했을 것이다
    const r = rule16(two);
    expect(r?.verdict).toBe('fail');
    expect(r?.message).toContain('128GB');
  });

  it('★ 어느 쪽이 한계인지 말한다 (§16.1)', () => {
    expect(rule16(build(192, 256, 128))?.message).toContain('CPU 사양은 128GB');
    expect(rule16(build(192, 128, 256))?.message).toContain('메인보드 사양은 128GB');
  });

  it('한쪽만 있으면 있는 쪽으로 판정한다', () => {
    expect(rule16(build(192, null, 128))?.verdict).toBe('fail');
    expect(rule16(build(192, 128, null))?.verdict).toBe('fail');
    expect(rule16(build(64, null, 128))?.verdict).toBe('pass');
  });

  it('둘 다 없으면 unknown', () => {
    const r = rule16(build(64, null, null));
    expect(r?.verdict).toBe('unknown');
    expect(r?.reason?.kind).toBe('missing');
  });

  it('메모리 용량이 없으면 unknown', () => {
    expect(rule16(build(null, 128, 256))?.verdict).toBe('unknown');
  });

  it('★ 작은 값을 이상치로 거르지 않는다 — 4GB는 LGA775에서 맞다 (§16.2)', () => {
    // 2슬롯 DDR2 보드의 최대 4GB. 실재하고 맞는 값이다 (22건)
    expect(rule16(build(4, 4, null, 2))?.verdict).toBe('pass');
    expect(rule16(build(8, 4, null, 2))?.verdict).toBe('fail');
    // Atom N550 보드의 2GB도 맞다
    expect(rule16(build(2, 2, null, 2))?.verdict).toBe('pass');
  });

  it('★ 최대가 슬롯 수보다 작으면 모순이다 (§16.2)', () => {
    // 실재하는 5건: X570/X399 Taichi·MEG X399의 0, H570-PLUS·TRX50-SAGE의 1
    for (const [max, slots] of [[0, 4], [0, 8], [1, 4]] as const) {
      const r = rule16(build(64, max, null, slots));
      expect(r?.verdict, `최대 ${max} / 슬롯 ${slots}`).toBe('unknown');
      expect(r?.reason?.kind).toBe('inconsistent');
    }
  });

  it('보드가 모순이어도 CPU 값이 있으면 그쪽으로 판정한다', () => {
    const r = rule16(build(192, 0, 128, 4));
    expect(r?.verdict).toBe('fail');
    expect(r?.message).toContain('CPU 사양은 128GB');
  });

  it('CPU의 0은 결측으로 본다 — 48건이 그렇다 (§16.2)', () => {
    // CPU가 0이라고 모든 메모리를 경고하지 않는다
    expect(rule16(build(64, 128, 0))?.verdict).toBe('pass');
  });

  it('CPU를 안 골랐어도 보드만으로 판정한다', () => {
    const r = rule16(
      f.withBuild({ cpu: null, ram: [{ ...f.ramKit, capacityGb: 512 }] }),
    );
    expect(r?.verdict).toBe('fail');
    expect(r?.message).toContain('메인보드');
  });

  it('부품을 안 골랐으면 null', () => {
    expect(rule16(f.withBuild({ ram: [] }))).toBeNull();
    expect(rule16(f.withBuild({ motherboard: null }))).toBeNull();
  });
});

describe('17. M.2 드라이브를 보드가 받는가 (Phase 1)', () => {
  const m2 = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ ...f.drive, id: `m2-${i}` }));
  const build = (drives: number, rows: number | null, memoryType = 'DDR5') =>
    f.withBuild({
      storage: m2(drives),
      motherboard: { ...f.motherboard, m2Slots: rows, memoryType },
    });

  it('★ M.2 슬롯이 없는 보드는 error — 이것만 셀 수 있다 (§17.4)', () => {
    // DDR2의 100%, DDR3의 86.3%가 0이다. 빈 목록은 쪼갤 것이 없어 믿을 수 있다
    const r = rule17(build(1, 0, 'DDR3'));
    expect(r?.verdict).toBe('fail');
    expect(r?.severity).toBe('error');
    expect(r?.message).toContain('M.2 슬롯이 없는데');
    expect(rule17(build(2, 0, 'DDR4'))?.verdict).toBe('fail');
  });

  it('★ 슬롯이 있으면 개수를 세지 않는다 — 배열 길이가 슬롯 수가 아니다 (§17.4)', () => {
    // ASUS PRIME B650M-A는 슬롯 2개인데 4행, Gigabyte Z790 AORUS ELITE AX는
    // 슬롯 4개인데 3행이다. 같은 계열이 다른 행 수로 존재하는 것이 138건이다
    for (const [drives, rows] of [[1, 3], [3, 2], [5, 4]] as const) {
      const r = rule17(build(drives, rows));
      expect(r?.verdict, `드라이브 ${drives} / 행 ${rows}`).toBe('unknown');
      expect(r?.reason?.kind).toBe('inconsistent');
    }
  });

  it('M.2 드라이브가 없으면 pass — 볼 것이 없다', () => {
    const b = f.withBuild({
      storage: [f.sataDrive],
      motherboard: { ...f.motherboard, m2Slots: 0, memoryType: 'DDR4' },
    });
    const r = rule17(b);
    expect(r?.verdict).toBe('pass');
    expect(r?.message).toContain('M.2 드라이브가 없습니다');
  });

  it('★ DDR5 보드의 0은 판정하지 않는다 (§17.2)', () => {
    const r = rule17(build(1, 0, 'DDR5'));
    expect(r?.verdict).toBe('unknown');
    expect(r?.reason?.kind).toBe('inconsistent');
  });

  it('★ 자리를 세지 못한 드라이브는 그 사실을 적는다 (§17.1)', () => {
    const aic = { ...f.drive, id: 'aic', name: 'Intel Optane 905P', formFactor: 'PCIe' };
    const b = f.withBuild({
      storage: [aic],
      motherboard: { ...f.motherboard, m2Slots: 0, memoryType: 'DDR4' },
    });
    const r = rule17(b);
    expect(r?.verdict).toBe('pass');
    expect(r?.notes?.join(' ')).toContain('Optane');
    expect(r?.notes?.join(' ')).toContain('세지 않았습니다');
  });

  it('슬롯 수나 규격이 없으면 unknown', () => {
    expect(rule17(build(1, null))?.verdict).toBe('unknown');
    expect(
      rule17(f.withBuild({ storage: [{ ...f.drive, formFactor: null }] }))?.verdict,
    ).toBe('unknown');
  });

  it('부품을 안 골랐으면 null', () => {
    expect(rule17(f.withBuild({ storage: [] }))).toBeNull();
    expect(rule17(f.withBuild({ motherboard: null }))).toBeNull();
  });
});

describe('18. SATA 드라이브 수 ≤ 보드 SATA 포트 수 (Phase 1)', () => {
  const sata = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ ...f.sataDrive, id: `s-${i}` }));
  const build = (drives: number, p6: number | null, p3: number | null = 0) =>
    f.withBuild({
      storage: sata(drives),
      motherboard: { ...f.motherboard, sataPorts: p6, sataPorts3Gbs: p3 },
      pcCase: { ...f.pcCase, internal35Bays: 99 },
    });

  it('들어가면 pass', () => {
    expect(rule18(build(4, 6))?.verdict).toBe('pass');
  });

  it('넘으면 error', () => {
    const r = rule18(build(7, 6));
    expect(r?.verdict).toBe('fail');
    expect(r?.severity).toBe('error');
  });

  it('★ 6Gb/s와 3Gb/s를 합산한다', () => {
    expect(rule18(build(6, 4, 2))?.verdict).toBe('pass');
    expect(rule18(build(7, 4, 2))?.verdict).toBe('fail');
  });

  it('★ 포트 0은 미입력이다 — 규칙 17과 반대다 (§18.2)', () => {
    // 세대별 경향 없이 24.9%가 0이고, DDR2·DDR3 보드도 0으로 적혀 있다
    const r = rule18(build(1, 0, 0));
    expect(r?.verdict).toBe('unknown');
    expect(r?.reason?.kind).toBe('inconsistent');
  });

  it('★ M.2 SATA는 세지 않는다 — 칩셋에 달려 있다 (§18.1)', () => {
    const m2sata = { ...f.drive, id: 'm2s', interface: 'M.2 SATA' };
    const b = f.withBuild({
      storage: [m2sata],
      motherboard: { ...f.motherboard, sataPorts: 0, sataPorts3Gbs: 1 },
    });
    // 포트 1개인데 M.2 SATA를 셌다면 통과했을지 아닐지가 달라진다
    const r = rule18(b);
    expect(r?.verdict).toBe('pass');
    expect(r?.message).toContain('SATA 0개');
  });

  it('SAS도 세지 않는다 — 일반 보드에 포트가 없다', () => {
    const sas = { ...f.sataDrive, id: 'sas', interface: 'SAS 12.0 Gb/s' };
    expect(rule18(f.withBuild({ storage: [sas] }))?.message).toContain('SATA 0개');
  });

  it('둘 다 결측이면 unknown, 한쪽만 있으면 판정한다', () => {
    expect(rule18(build(1, null, null))?.verdict).toBe('unknown');
    expect(rule18(build(1, null, 2))?.verdict).toBe('pass');
  });
});

describe('19. 3.5"·2.5" 드라이브 수 ≤ 케이스 베이 수 (Phase 1)', () => {
  const drives = (ff: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({ ...f.sataDrive, id: `${ff}-${i}`, formFactor: ff }));
  const build = (ff: string, n: number, b35: number | null, b25: number | null) =>
    f.withBuild({
      storage: drives(ff, n),
      pcCase: { ...f.pcCase, internal35Bays: b35, internal25Bays: b25 },
    });

  it('들어가면 pass', () => {
    expect(rule19(build('3.5"', 2, 6, 3))?.verdict).toBe('pass');
  });

  it('★ 3.5"가 넘으면 오류 — 갈 곳이 없다 (§19.2)', () => {
    const r = rule19(build('3.5"', 3, 2, 3));
    expect(r?.verdict).toBe('fail');
    expect(r?.severity).toBe('error');
  });

  it('★ 2.5"가 넘으면 경고 — 3.5" 베이·트레이 뒷면에 붙는다 (§19.2)', () => {
    const r = rule19(build('2.5"', 4, 6, 2));
    expect(r?.verdict).toBe('fail');
    expect(r?.severity).toBe('warning');
    expect(r?.message).toContain('설명서');
  });

  it('★ 베이 0은 값이다 — Mini-ITX에 실재한다 (§19.1)', () => {
    const r = rule19(build('3.5"', 1, 0, 2));
    expect(r?.verdict).toBe('fail');
    expect(r?.severity).toBe('error');
  });

  it('M.2만 담으면 베이를 쓰지 않는다', () => {
    const r = rule19(f.withBuild({ storage: [f.drive] }));
    expect(r?.verdict).toBe('pass');
    expect(r?.message).toContain('쓰는 드라이브가 없습니다');
  });

  it('★ 쓰지 않는 크기의 베이 결측은 판정을 막지 않는다', () => {
    // 3.5"만 담았는데 2.5" 베이가 비어 있다고 판정 불가로 만들지 않는다
    expect(rule19(build('3.5"', 1, 6, null))?.verdict).toBe('pass');
    expect(rule19(build('2.5"', 1, null, 3))?.verdict).toBe('pass');
    // 쓰는 쪽이 비면 판정 불가다
    expect(rule19(build('3.5"', 1, null, 3))?.verdict).toBe('unknown');
  });

  it('부품을 안 골랐으면 null', () => {
    expect(rule19(f.withBuild({ storage: [] }))).toBeNull();
    expect(rule19(f.withBuild({ pcCase: null }))).toBeNull();
  });
});

describe('엔진', () => {
  it('정상 견적은 18개 규칙이 통과하고 1개가 판정 불가다', () => {
    const v = evaluate(f.goodBuild);
    // 규칙 17은 슬롯 수를 셀 수 없어 판정 불가다 (§17.4). 정상 동작이다
    expect(v.counts.pass).toBe(18);
    expect(v.counts.fail).toBe(0);
    expect(v.counts.unknown).toBe(1);
  });

  it('고르지 않은 부품의 규칙은 결과에서 빠진다', () => {
    const v = evaluate(f.withBuild({ gpu: null, pcCase: null, psu: null }));
    const ids = v.results.map((r) => r.ruleId);
    // 12는 CPU+보드만으로, 16은 메모리+보드, 17·18은 스토리지+보드만으로,
    // 20은 CPU+쿨러만으로 판정된다. 케이스·GPU·파워를 안 골라도 남는다.
    // 21·22는 **안 고른 것이 입력이다** — CPU만 있으면 돈다 (§21, §22)
    expect(ids).toEqual([1, 2, 3, 12, 16, 17, 18, 20, 21, 22, 23]);
  });

  it('빈 견적은 적용할 규칙이 없다', () => {
    const v = evaluate(emptyBuild);
    expect(v.results).toHaveLength(0);
  });

  it('결과는 항상 규칙 번호순이다', () => {
    const ids = evaluate(f.goodBuild).results.map((r) => r.ruleId);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });
});

describe('estimatePower — 판정과 화면이 같은 수치를 쓴다', () => {
  it('규칙 7의 메시지에 나오는 수치와 일치한다', () => {
    // 기준 견적: CPU PPT 162W + GPU TDP 360W, 메모리 2모듈
    const est = estimatePower({ cpuW: 162, gpuW: 360, ramModules: 2 });
    expect(est.minW).toBe(551); // 522 + 25 + 2×2
    expect(est.maxW).toBe(612); // 522 + 80 + 5×2
    expect(est.recommendedW).toBe(Math.ceil(612 * 1.3));

    const r = rule7(f.goodBuild);
    expect(r?.message).toContain(`${est.minW}~${est.maxW}W`);
    expect(r?.message).toContain(`${est.recommendedW}W`);
  });

  it('GPU가 없으면 내역에서도 빠진다 — 내장그래픽 구성', () => {
    const est = estimatePower({ cpuW: 162, gpuW: null, ramModules: 2 });
    expect(est.parts.map((p) => p.label)).toEqual(['CPU']);
    expect(est.maxW).toBe(252); // 162 + 80 + 10
  });

  it('구간은 항상 최소 ≤ 최대 ≤ 권장이다', () => {
    for (const [cpu, gpu, mods] of [
      [0, 0, 0],
      [65, 75, 1],
      [253, 575, 4],
    ] as const) {
      const est = estimatePower({ cpuW: cpu, gpuW: gpu, ramModules: mods });
      expect(est.minW).toBeLessThanOrEqual(est.maxW);
      expect(est.maxW).toBeLessThanOrEqual(est.recommendedW);
    }
  });
});

describe('7.4.1 계산에서 빠진 부품을 말한다 (§7.4.1)', () => {
  it('★ 드라이브가 있으면 빠졌다고 적는다', () => {
    const r = rule7(f.goodBuild);
    const notes = r?.notes?.join(' ') ?? '';
    expect(notes).toContain('드라이브 1개');
    expect(notes).toContain('계산에 넣지 않았습니다');
    // 어느 쪽으로 틀렸는지까지 말한다
    expect(notes).toContain('이 구간보다 높습니다');
  });

  it('빠진 부품을 가정 설명보다 앞에 적는다', () => {
    const notes = rule7(f.goodBuild)?.notes ?? [];
    expect(notes[0]).toContain('드라이브');
    expect(notes[1]).toContain('가정');
  });

  it('드라이브가 없으면 그 말을 하지 않는다', () => {
    const notes = rule7(f.withBuild({ storage: [] }))?.notes?.join(' ') ?? '';
    expect(notes).not.toContain('드라이브');
    expect(notes).toContain('가정');
  });

  it('★ 드라이브를 전력 합계에 넣지 않는다 — 추정치를 지어내지 않는다', () => {
    const none = rule7(f.withBuild({ storage: [] }));
    const many = rule7(
      f.withBuild({ storage: [f.drive, { ...f.drive, id: 'd2' }, { ...f.drive, id: 'd3' }] }),
    );
    const watts = (m: string | undefined) => m?.match(/약 (\d+)~(\d+)W/)?.slice(1, 3);
    expect(watts(many?.message)).toEqual(watts(none?.message));
  });
});
