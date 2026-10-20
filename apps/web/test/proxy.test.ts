/**
 * 어드민 문지기의 **응답** — ADR-0020.
 *
 * 판정(`adminGate`)은 `admin-gate.test.ts`가 덮는다. 여기서는 그 판정이 어떤 HTTP 응답이
 * 되는지를 본다. 401이 도전 헤더 없이 나가면 브라우저가 비밀을 묻지 않고, 캐시되면 막힌
 * 화면이 남는다. 꺼진 어드민이 401을 내면 「여기 뭔가 있다」고 알린다.
 */

import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxy } from '../src/proxy';

const TOKEN = 'proxy-test-secret-123456';
const basic = (secret: string) => `Basic ${Buffer.from(`admin:${secret}`).toString('base64')}`;
const request = (authorization?: string) =>
  new NextRequest('http://localhost/admin', authorization ? { headers: { authorization } } : {});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('proxy — 판정이 어떤 응답이 되는가', () => {
  it('맞는 비밀이면 그대로 통과시킨다', () => {
    vi.stubEnv('ADMIN_TOKEN', TOKEN);
    vi.stubEnv('NODE_ENV', 'production');
    const res = proxy(request(basic(TOKEN)));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('개발 환경에서 비밀이 없으면 열린다', () => {
    vi.stubEnv('ADMIN_TOKEN', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(proxy(request()).headers.get('x-middleware-next')).toBe('1');
  });

  it('★ 배포본에서 비밀이 없으면 없는 주소처럼 — 401이 아니라 404 경로로 넘긴다', () => {
    vi.stubEnv('ADMIN_TOKEN', '');
    vi.stubEnv('NODE_ENV', 'production');
    const res = proxy(request());
    expect(res.status).not.toBe(401);
    expect(res.headers.get('www-authenticate')).toBeNull();
    expect(res.headers.get('x-middleware-rewrite')).toBe('http://localhost/__admin-off');
  });

  it('★ 틀리거나 없으면 401 + Basic 도전 + 캐시 금지', () => {
    vi.stubEnv('ADMIN_TOKEN', TOKEN);
    vi.stubEnv('NODE_ENV', 'production');
    for (const res of [proxy(request()), proxy(request(basic('wrong-secret-000000')))]) {
      expect(res.status).toBe(401);
      expect(res.headers.get('www-authenticate')).toMatch(/^Basic realm=/);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('x-middleware-next')).toBeNull();
    }
  });

  it('★ 모든 화면을 보되 정적 산출물만 뺀다 — prefetch 헤더로 비켜 갈 수 없다', async () => {
    const { config } = await import('../src/proxy');
    expect(config.matcher).toEqual(['/((?!_next/static|_next/image|favicon.ico).*)']);
    // 공식 예시의 `missing: next-router-prefetch`를 넣으면 그 헤더 하나로 어드민 검사를 건너뛴다
    expect(JSON.stringify(config)).not.toContain('prefetch');
  });
});

describe('proxy — CSP nonce (ADR-0026)', () => {
  const page = (path = '/') => new NextRequest(`http://localhost${path}`);

  it('응답에 nonce가 든 CSP를 붙이고, 같은 nonce를 요청 헤더로 넘긴다', () => {
    const res = proxy(page());
    const csp = res.headers.get('content-security-policy') ?? '';
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    // Next가 넘겨받은 요청 헤더를 읽어 자기 스크립트에 nonce를 붙인다
    expect(res.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
  });

  it('요청마다 nonce가 다르다', () => {
    const a = proxy(page()).headers.get('content-security-policy');
    const b = proxy(page()).headers.get('content-security-policy');
    expect(a).not.toBe(b);
  });

  it('어드민 통과 응답은 캐시 금지 + 색인 금지', () => {
    vi.stubEnv('ADMIN_TOKEN', TOKEN);
    vi.stubEnv('NODE_ENV', 'production');
    const res = proxy(request(basic(TOKEN)));
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-robots-tag')).toContain('noindex');
  });
});

describe('proxy — 요청 제한 (이슈 #115)', () => {
  const from = (ip: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
    new NextRequest('http://localhost/', {
      method: init.method ?? 'GET',
      headers: { 'x-forwarded-for': ip, ...init.headers },
    });

  it('★ 서버 동작을 몰아치면 429 — 다른 IP는 영향 없다', () => {
    const action = { method: 'POST', headers: { 'next-action': 'abc' } };
    let last = 0;
    for (let i = 0; i < 200; i += 1) last = proxy(from('203.0.113.7', action)).status;
    expect(last).toBe(429);
    expect(proxy(from('203.0.113.8', action)).status).toBe(200);
    // 화면 GET은 세지 않는다
    expect(proxy(from('203.0.113.7')).status).toBe(200);
  });

  it('★ 어드민 비밀을 계속 틀리면 비밀을 보기 전에 429', () => {
    vi.stubEnv('ADMIN_TOKEN', TOKEN);
    vi.stubEnv('NODE_ENV', 'production');
    const wrong = () =>
      proxy(
        new NextRequest('http://localhost/admin', {
          headers: { 'x-forwarded-for': '198.51.100.9', authorization: basic('wrong-secret-000000') },
        }),
      );
    const statuses = Array.from({ length: 25 }, () => wrong().status);
    expect(statuses.slice(0, 20).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
    // 막힌 IP는 맞는 비밀로도 잠시 못 들어온다 — 맞혀 보기를 멈추게 하는 것이 목적이다
    const right = proxy(
      new NextRequest('http://localhost/admin', {
        headers: { 'x-forwarded-for': '198.51.100.9', authorization: basic(TOKEN) },
      }),
    );
    expect(right.status).toBe(429);
  });
});
