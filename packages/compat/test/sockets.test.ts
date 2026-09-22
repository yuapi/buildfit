/**
 * 같은 소켓을 다르게 적은 표기 — 이슈 #16, docs/compat-rules.md §1.1.
 *
 * **두 방향을 다 본다.** 묶어야 할 것이 묶이는지, 그리고 **묶으면 안 되는 것이
 * 여전히 오류로 남는지.** 뒤쪽이 더 중요하다 — 묶는 쪽으로 틀리면 거짓 통과가
 * 되고, 그건 이 도구가 낼 수 있는 가장 나쁜 결과다.
 */

import { describe, expect, it } from 'vitest';
import { pickerConstraints } from '../src/picker';
import { rule1 } from '../src/rules';
import { sameSocket, socketAliases } from '../src/sockets';
import * as f from './fixtures';

const withSockets = (cpuSocket: string, boardSocket: string) =>
  f.withBuild({
    cpu: { ...f.cpu, socket: cpuSocket },
    motherboard: { ...f.motherboard, socket: boardSocket },
  });

describe('소켓 등가 (이슈 #16)', () => {
  it('★ TR4와 sTR4는 같은 소켓이다 — 양방향', () => {
    expect(sameSocket('sTR4', 'TR4')).toBe(true);
    expect(sameSocket('TR4', 'sTR4')).toBe(true);
    expect(rule1(withSockets('sTR4', 'TR4'))?.verdict).toBe('pass');
    expect(rule1(withSockets('TR4', 'sTR4'))?.verdict).toBe('pass');
  });

  it('통과 문구가 CPU 쪽 표기를 쓴다 — 두 표기를 섞어 말하지 않는다', () => {
    expect(rule1(withSockets('sTR4', 'TR4'))?.message).toContain('sTR4');
  });

  it.each([
    // 칩셋이 받는 CPU를 가른다 — 묶으면 데스크톱 Core i7이 서버 보드에서 통과한다
    ['LGA 2011-3', 'LGA 2011-3 Narrow'],
    // 듀얼 소켓 보드는 2P 지원 Xeon만 받는다
    ['LGA 2011', '2 x LGA 2011'],
    ['LGA 2011-3', '2 x LGA 2011-3'],
    ['G34', '2 x G34'],
    // 핀은 같아도 지원 세대가 다르다
    ['LGA 1151', 'LGA 1151v2'],
    // 이름이 비슷할 뿐 다른 소켓
    ['sTR4', 'sTRX4'],
    ['sTRX4', 'sTR5'],
    ['AM4', 'AM5'],
  ])('★ %s 와 %s 는 묶지 않는다 — 여전히 오류다', (cpuSocket, boardSocket) => {
    expect(sameSocket(cpuSocket, boardSocket)).toBe(false);
    const r = rule1(withSockets(cpuSocket, boardSocket));
    expect(r?.verdict).toBe('fail');
    expect(r?.severity).toBe('error');
  });

  it('표에 없는 소켓은 자기 자신만 돌려준다 — 모르는 것을 묶지 않는다', () => {
    expect(socketAliases('AM5')).toEqual(['AM5']);
    expect(socketAliases('처음 보는 소켓')).toEqual(['처음 보는 소켓']);
  });

  it('대소문자를 무시하지 않는다 — 원본 표기 그대로 비교한다', () => {
    // 'str4'를 sTR4로 받아 주면, 언젠가 대소문자만 다른 **다른** 소켓이 생겼을 때
    // 조용히 묶인다. 표에 적힌 표기만 묶는다.
    expect(sameSocket('str4', 'TR4')).toBe(false);
  });
});

describe('★ 고르기 제약이 규칙 1과 같은 표를 쓴다', () => {
  it('TR4 보드를 고르면 sTR4 CPU가 숨지 않는다', () => {
    const cons = pickerConstraints(
      f.withBuild({ cpu: null, motherboard: { ...f.motherboard, socket: 'TR4' } }),
      'cpu',
    );
    const socket = cons.find((c) => c.ruleId === 1);
    expect(socket?.kind).toBe('oneOf');
    expect(socket && 'values' in socket ? [...socket.values].sort() : []).toEqual(['TR4', 'sTR4']);
  });

  it('sTR4 CPU를 고르면 TR4 보드가 숨지 않는다', () => {
    const cons = pickerConstraints(
      f.withBuild({ motherboard: null, cpu: { ...f.cpu, socket: 'sTR4' } }),
      'motherboard',
    );
    const socket = cons.find((c) => c.ruleId === 1);
    expect(socket && 'values' in socket ? socket.values : []).toContain('TR4');
  });

  it('등가 표기가 없는 소켓은 전처럼 equals다', () => {
    const cons = pickerConstraints(
      f.withBuild({ cpu: null, motherboard: { ...f.motherboard, socket: 'AM5' } }),
      'cpu',
    );
    expect(cons.find((c) => c.ruleId === 1)).toMatchObject({ kind: 'equals', value: 'AM5' });
  });

  it('★ 고르기가 남기는 CPU는 규칙 1도 통과시킨다 — 둘이 갈라지지 않는다', () => {
    // "고를 땐 나오는데 판정은 오류"가 되면 안 된다 (ADR-0010)
    for (const board of ['TR4', 'sTR4', 'AM5', 'LGA 2011-3 Narrow']) {
      const cons = pickerConstraints(
        f.withBuild({ cpu: null, motherboard: { ...f.motherboard, socket: board } }),
        'cpu',
      );
      const c = cons.find((x) => x.ruleId === 1)!;
      const kept = c.kind === 'oneOf' ? c.values : c.kind === 'equals' ? [c.value] : [];
      for (const cpuSocket of kept) {
        expect(
          rule1(withSockets(cpuSocket, board))?.verdict,
          `고르기는 ${board} 보드에 ${cpuSocket} CPU를 남기는데 규칙 1이 막는다`,
        ).toBe('pass');
      }
    }
  });
});
