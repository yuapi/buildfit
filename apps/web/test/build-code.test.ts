/**
 * 공유 URL 코드 — ADR-0012.
 *
 * **v1 디코더는 리팩터링 대상이 아니다.** 이미 뿌려진 링크가 계속 열려야 하므로
 * 여기 고정한 동작을 바꾸면 안 된다.
 */

import { describe, expect, it } from 'vitest';
import { BUILD_CODE_VERSION, decodeBuildCode, encodeBuildCode } from '../src/lib/build-code';

const CPU = '11111111-1111-4111-8111-111111111111';
const MB = '22222222-2222-4222-8222-222222222222';
const GPU = '33333333-3333-4333-8333-333333333333';
const CASE = '44444444-4444-4444-8444-444444444444';
const PSU = '55555555-5555-4555-8555-555555555555';
const RAM1 = '66666666-6666-4666-8666-666666666666';
const RAM2 = '77777777-7777-4777-8777-777777777777';
const COOLER = '88888888-8888-4888-8888-888888888888';

/**
 * v1 시절에 만들어진 코드. **이 문자열은 바뀌지 않는다.**
 * 실제로 v1 인코더가 낸 값이고, 지금도 같은 구성으로 읽혀야 한다.
 */
const V1_CPU_MB = 'AQMRERERERFBEYERERERERERIiIiIiIiQiKCIiIiIiIiIg';

describe('왕복', () => {
  it('전체 구성을 그대로 복원한다', () => {
    const sel = { cpu: CPU, motherboard: MB, gpu: GPU, pcCase: CASE, psu: PSU, ram: [RAM1, RAM2] };
    expect(decodeBuildCode(encodeBuildCode(sel))).toEqual(sel);
  });

  it('일부만 고른 구성도 복원한다', () => {
    const sel = { cpu: CPU, pcCase: CASE };
    expect(decodeBuildCode(encodeBuildCode(sel))).toEqual(sel);
  });

  it('메모리만 고른 구성도 복원한다', () => {
    expect(decodeBuildCode(encodeBuildCode({ ram: [RAM1] }))).toEqual({ ram: [RAM1] });
  });

  it('빈 구성도 왕복한다', () => {
    expect(decodeBuildCode(encodeBuildCode({}))).toEqual({});
  });

  it('고르지 않은 슬롯은 결과에 키 자체가 없다', () => {
    const decoded = decodeBuildCode(encodeBuildCode({ cpu: CPU }));
    expect(decoded).toEqual({ cpu: CPU });
    expect(Object.keys(decoded ?? {})).toEqual(['cpu']);
  });
});

describe('안정성 — 같은 구성은 항상 같은 코드', () => {
  it('키 순서가 달라도 같은 코드가 나온다', () => {
    const a = encodeBuildCode({ cpu: CPU, psu: PSU, gpu: GPU });
    const b = encodeBuildCode({ gpu: GPU, cpu: CPU, psu: PSU });
    expect(a).toBe(b);
  });

  it('전체 구성 코드가 URL에 넣을 만한 길이다', () => {
    const code = encodeBuildCode({
      cpu: CPU, motherboard: MB, gpu: GPU, pcCase: CASE, psu: PSU, ram: [RAM1, RAM2],
    });
    expect(code.length).toBeLessThan(200);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/); // URL 안전 문자만
  });
});

describe('v1 코드는 영원히 읽힌다 — 이미 뿌려진 링크가 있다', () => {
  it('v1 시절 코드가 같은 구성으로 읽힌다 (회귀 고정)', () => {
    expect(decodeBuildCode(V1_CPU_MB)).toEqual({ cpu: CPU, motherboard: MB });
  });

  it('v1 코드의 버전 바이트는 1이다', () => {
    expect(atob(V1_CPU_MB.replace(/-/g, '+').replace(/_/g, '/')).charCodeAt(0)).toBe(1);
  });

  it('v1에는 쿨러 슬롯이 없다. 없는 값을 지어내지 않는다', () => {
    expect(decodeBuildCode(V1_CPU_MB)).not.toHaveProperty('cooler');
  });

  it('v1 메모리 비트(1<<5)를 v2 배치로 잘못 읽지 않는다', () => {
    // v1 인코더가 cpu + 메모리 1개를 담은 코드. 마스크는 0b100001 = 33
    const bytes = [1, 0b100001];
    for (const hex of [CPU, RAM1]) {
      if (hex === RAM1) bytes.push(1);
      for (const b of hex.replace(/-/g, '').match(/../g)!) bytes.push(Number.parseInt(b, 16));
    }
    const code = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(decodeBuildCode(code)).toEqual({ cpu: CPU, ram: [RAM1] });
  });
});

describe('v2 포맷 고정 — 바꾸면 기존 링크가 죽는다', () => {
  it('새 코드의 버전 바이트가 2다', () => {
    const code = encodeBuildCode({ cpu: CPU });
    const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    expect(bin.charCodeAt(0)).toBe(BUILD_CODE_VERSION);
    expect(BUILD_CODE_VERSION).toBe(2);
  });

  it('앞의 다섯 슬롯 순서를 v1에서 그대로 물려받는다', () => {
    // cpu(비트0)와 psu(비트4)만 고르면 마스크는 0b10001 = 17
    const code = encodeBuildCode({ cpu: CPU, psu: PSU });
    const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    expect(bin.charCodeAt(1)).toBe(0b10001);
  });

  it('쿨러는 비트 5, 메모리는 비트 6이다', () => {
    const code = encodeBuildCode({ cooler: COOLER, ram: [RAM1] });
    const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    expect(bin.charCodeAt(1)).toBe(0b1100000);
  });

  it('쿨러를 포함한 구성이 왕복한다', () => {
    const sel = { cpu: CPU, motherboard: MB, gpu: GPU, pcCase: CASE, psu: PSU, cooler: COOLER, ram: [RAM1, RAM2] };
    expect(decodeBuildCode(encodeBuildCode(sel))).toEqual(sel);
  });

  it('쿨러만 고른 구성도 왕복한다', () => {
    expect(decodeBuildCode(encodeBuildCode({ cooler: COOLER }))).toEqual({ cooler: COOLER });
  });
});

describe('깨진 입력 — 던지지 않고 null', () => {
  it.each([
    ['빈 문자열', ''],
    ['base64가 아닌 문자', '!!!not-base64!!!'],
    ['너무 짧음', 'AQ'],
    // v3는 아직 없다. 모르는 버전을 아는 척 읽으면 엉뚱한 부품이 나간다
    ['알 수 없는 버전', 'AwMRERERERFBEYERERERERERIiIiIiIiQiKCIiIiIiIiIg'],
  ])('%s → null', (_label, code) => {
    expect(decodeBuildCode(code)).toBeNull();
  });

  it('선언한 슬롯보다 바이트가 모자라면 null', () => {
    const full = encodeBuildCode({ cpu: CPU, motherboard: MB });
    expect(decodeBuildCode(full.slice(0, 10))).toBeNull();
  });

  it('남는 바이트가 있으면 손상으로 보고 null', () => {
    const code = encodeBuildCode({ cpu: CPU });
    expect(decodeBuildCode(code + 'AAAA')).toBeNull();
  });

  it('UUID가 아닌 값은 인코딩에서 조용히 빠진다', () => {
    expect(decodeBuildCode(encodeBuildCode({ cpu: 'not-a-uuid', psu: PSU }))).toEqual({ psu: PSU });
  });
});
