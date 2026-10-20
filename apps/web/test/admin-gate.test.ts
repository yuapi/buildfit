/**
 * 어드민 접근 판정 (ADR-0020).
 *
 * 막는 규칙이 두 곳(미들웨어·서버 컴포넌트)에서 쓰이므로 판정 자체를 여기서 고정한다.
 */
import { describe, expect, it } from 'vitest';
import { adminGate, MIN_ADMIN_TOKEN, type AdminGateInput } from '../src/lib/admin-gate';

const TOKEN = 'a'.repeat(MIN_ADMIN_TOKEN);

function basic(user: string, secret: string): string {
  const bytes = new TextEncoder().encode(`${user}:${secret}`);
  return `Basic ${btoa(String.fromCharCode(...bytes))}`;
}

function gate(over: Partial<AdminGateInput>) {
  return adminGate({ token: TOKEN, isProduction: true, authorization: null, ...over });
}

describe('adminGate — 비밀이 없을 때', () => {
  it('배포본에서는 어드민이 아예 없다', () => {
    expect(gate({ token: undefined })).toBe('disabled');
    expect(gate({ token: '' })).toBe('disabled');
    expect(gate({ token: '   ' })).toBe('disabled');
  });

  it('개발 환경에서는 지금까지처럼 열린다 — 설정 없이 보강할 수 있어야 한다', () => {
    expect(gate({ token: undefined, isProduction: false })).toBe('open');
  });

  it('비밀이 있어도 짧으면 없는 것으로 친다', () => {
    const short = 'a'.repeat(MIN_ADMIN_TOKEN - 1);
    expect(gate({ token: short })).toBe('disabled');
    // 짧은 비밀을 「맞다」고 통과시키지 않는다. 있다고 착각하는 쪽이 더 나쁘다.
    expect(gate({ token: short, authorization: basic('x', short) })).toBe('disabled');
  });
});

describe('adminGate — 비밀이 있을 때', () => {
  it('맞으면 통과', () => {
    expect(gate({ authorization: basic('아무개', TOKEN) })).toBe('ok');
  });

  it('아이디는 보지 않는다 — 계정이 아니라 비밀이다', () => {
    expect(gate({ authorization: basic('', TOKEN) })).toBe('ok');
    expect(gate({ authorization: basic('admin', TOKEN) })).toBe('ok');
  });

  it('콜론이 없으면 전체를 비밀로 본다', () => {
    expect(gate({ authorization: `Basic ${btoa(TOKEN)}` })).toBe('ok');
  });

  it('틀리거나 없으면 401', () => {
    expect(gate({ authorization: null })).toBe('unauthorized');
    expect(gate({ authorization: undefined })).toBe('unauthorized');
    expect(gate({ authorization: basic('x', `${TOKEN}b`) })).toBe('unauthorized');
    expect(gate({ authorization: basic('x', TOKEN.slice(0, -1)) })).toBe('unauthorized');
    // 앞자리만 맞는 것도 틀린 것이다
    expect(gate({ authorization: `Basic ${btoa('a')}` })).toBe('unauthorized');
  });

  it('개발 환경이라도 비밀이 있으면 물어본다', () => {
    expect(gate({ isProduction: false, authorization: null })).toBe('unauthorized');
    expect(gate({ isProduction: false, authorization: basic('x', TOKEN) })).toBe('ok');
  });

  it('Basic이 아닌 헤더는 통하지 않는다', () => {
    expect(gate({ authorization: `Bearer ${TOKEN}` })).toBe('unauthorized');
    expect(gate({ authorization: TOKEN })).toBe('unauthorized');
    expect(gate({ authorization: 'Basic ***' })).toBe('unauthorized');
    expect(gate({ authorization: 'Basic' })).toBe('unauthorized');
  });

  it('스킴 대소문자와 앞뒤 공백은 가린다', () => {
    expect(gate({ authorization: `  basic   ${btoa(`x:${TOKEN}`)}  ` })).toBe('ok');
  });

  it('한글 비밀도 통한다 — atob이 주는 바이트를 UTF-8로 푼다', () => {
    const ko = '가나다라마바사아자차카타파하';
    expect(ko.length).toBeGreaterThanOrEqual(MIN_ADMIN_TOKEN - 2);
    const longKo = `${ko}가나`;
    expect(adminGate({ token: longKo, isProduction: true, authorization: basic('x', longKo) })).toBe('ok');
  });
});
