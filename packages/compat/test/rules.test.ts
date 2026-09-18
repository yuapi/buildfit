/**
 * 규칙 엔진 회귀 테스트.
 *
 * 구성은 docs/compat-rules.md §9의 체크리스트를 따른다.
 * - 규칙마다 pass / fail
 * - 규칙마다 필요 필드를 null로 비운 unknown
 * - 규칙 8의 모순 케이스 ★ 결측 검사로는 잡히지 않는다
 * - 규칙 4의 경계 케이스
 */

import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/engine';
import { rule1, rule2, rule3, rule4, rule5, rule6, rule7, rule8 } from '../src/rules';
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
});

describe('7. 총 소비전력 × 1.3 ≤ PSU 정격', () => {
  it('상수가 확정되기 전에는 계산하지 않고 판정 불가를 낸다', () => {
    const r = rule7(f.goodBuild);
    expect(r?.verdict).toBe('unknown');
    expect(r?.message).toContain('기준값');
  });

  it('소비전력 자체가 없으면 그 사유로 판정 불가', () => {
    const r = rule7(f.withBuild({ cpu: { ...f.cpu, tdp: null, ppt: null } }));
    expect(r?.verdict).toBe('unknown');
    expect(r?.reason?.fields[0]?.field).toContain('소비전력');
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

describe('엔진', () => {
  it('정상 견적은 규칙 7만 판정 불가로 남는다 (상수 미확정)', () => {
    const v = evaluate(f.goodBuild);
    expect(v.counts.fail).toBe(0);
    expect(v.counts.unknown).toBe(1);
    expect(v.counts.pass).toBe(7);
  });

  it('고르지 않은 부품의 규칙은 결과에서 빠진다', () => {
    const v = evaluate(f.withBuild({ gpu: null, pcCase: null, psu: null }));
    const ids = v.results.map((r) => r.ruleId);
    expect(ids).toEqual([1, 2, 3]);
  });

  it('빈 견적은 적용할 규칙이 없다', () => {
    const v = evaluate({ cpu: null, motherboard: null, ram: [], gpu: null, pcCase: null, psu: null });
    expect(v.results).toHaveLength(0);
  });

  it('결과는 항상 규칙 번호순이다', () => {
    const ids = evaluate(f.goodBuild).results.map((r) => r.ruleId);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });
});
