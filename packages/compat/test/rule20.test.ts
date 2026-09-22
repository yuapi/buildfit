/**
 * 규칙 20 — 쿨러가 CPU 소켓을 지원하는가. docs/compat-rules.md §20, 이슈 #17.
 */

import { describe, expect, it } from 'vitest';
import { pickerConstraints } from '../src/picker';
import { rule1, rule20 } from '../src/rules';
import { coolerListCovers, sameSocket } from '../src/sockets';
import * as f from './fixtures';

const build = (cpuSocket: string | null, coolerSockets: readonly string[] | null) =>
  f.withBuild({
    cpu: { ...f.cpu, socket: cpuSocket },
    cooler: { ...f.cooler, supportedSockets: coolerSockets },
  });

describe('규칙 20 (이슈 #17)', () => {
  it('목록에 있으면 통과한다', () => {
    expect(rule20(build('AM5', ['AM4', 'AM5']))?.verdict).toBe('pass');
  });

  it('★ 목록에 없으면 경고다 — 오류가 아니다', () => {
    // AM4만 적은 쿨러가 AM5에 맞는 경우가 흔하다고 알려져 있지만 데이터로
    // 증명되지 않는다. 오류로 단정하지 않는다 (§20.1)
    const r = rule20(build('AM5', ['AM4', 'LGA 1700']));
    expect(r?.verdict).toBe('fail');
    expect(r?.severity).toBe('warning');
    expect(r?.message).toContain('AM5');
    expect(r?.message).toContain('제조사 스펙을 확인');
  });

  it.each(['AM5', 'LGA 1700', 'sTR4', 'LGA 1851'])(
    '문구의 조사가 소켓 이름의 끝소리와 무관하게 맞는다 — %s',
    (socket) => {
      // 이름 바로 뒤에 이/가를 붙이면 반은 틀린다 (AM5는 모음, LGA 1700은 받침)
      const r = rule20(build(socket, ['없는 소켓']));
      expect(r?.message).toContain(`${socket} 소켓이 없습니다`);
    },
  );

  it('★ 앞 세대로 묶지 않는다 — AM4만 있는 쿨러는 AM5에서 경고다', () => {
    expect(coolerListCovers(['AM4'], 'AM5')).toBe(false);
    expect(coolerListCovers(['LGA 1700'], 'LGA 1851')).toBe(false);
  });

  it('CPU 소켓이나 쿨러 목록이 없으면 판정 불가다', () => {
    expect(rule20(build(null, ['AM5']))?.verdict).toBe('unknown');
    expect(rule20(build('AM5', null))?.verdict).toBe('unknown');
  });

  it('빈 목록은 「지원 소켓 없음」이 아니라 결측이다', () => {
    expect(rule20(build('AM5', []))?.verdict).toBe('unknown');
  });

  it('쿨러나 CPU를 안 골랐으면 돌지 않는다', () => {
    expect(rule20(f.withBuild({ cooler: null }))).toBeNull();
    expect(rule20(f.withBuild({ cpu: null }))).toBeNull();
  });
});

describe('표기 보정 (§20.2)', () => {
  it('TR4/sTR4 등가 표를 그대로 쓴다', () => {
    expect(rule20(build('sTR4', ['TR4']))?.verdict).toBe('pass');
    expect(rule20(build('TR4', ['sTR4']))?.verdict).toBe('pass');
  });

  it.each(['LGA 1150', 'LGA 1151', 'LGA 1155', 'LGA 1156'])(
    '쿨러의 잘린 「LGA 115」가 %s를 덮는다',
    (socket) => {
      expect(rule20(build(socket, ['LGA 775', 'LGA 115', 'LGA 1366']))?.verdict).toBe('pass');
    },
  );

  it('「LGA 115」는 LGA 1200을 덮지 않는다 — 잘린 표기를 푸는 것과 호환을 더하는 것은 다르다', () => {
    expect(rule20(build('LGA 1200', ['LGA 115']))?.verdict).toBe('fail');
  });

  it('★ 115x 보정이 규칙 1(CPU↔보드)로 새지 않는다 — 새면 거짓 통과다', () => {
    // LGA 1150 CPU는 LGA 1151 보드에 안 들어간다
    expect(sameSocket('LGA 1150', 'LGA 1151')).toBe(false);
    expect(sameSocket('LGA 115', 'LGA 1151')).toBe(false);
    const r = rule1(
      f.withBuild({
        cpu: { ...f.cpu, socket: 'LGA 1150' },
        motherboard: { ...f.motherboard, socket: 'LGA 1151' },
      }),
    );
    expect(r?.verdict).toBe('fail');
    expect(r?.severity).toBe('error');
  });
});

describe('고르기 (ADR-0016)', () => {
  it('★ 경고 규칙이므로 쿨러 후보를 숨기지 않는다', () => {
    const cons = pickerConstraints(
      f.withBuild({ cooler: null, cpu: { ...f.cpu, socket: 'AM5' } }),
      'cooler',
    );
    expect(cons.filter((c) => c.ruleId === 20)).toEqual([]);
  });
});
