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

  it('어드민 경로만 본다 — 공개 화면은 건드리지 않는다', async () => {
    const { config } = await import('../src/proxy');
    expect(config.matcher).toEqual(['/admin', '/admin/:path*']);
  });
});
