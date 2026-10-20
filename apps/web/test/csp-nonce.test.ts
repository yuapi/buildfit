/**
 * CSP nonce가 실제로 붙는지 — ADR-0026.
 *
 * nonce CSP는 **모든 화면이 동적 렌더링일 때만** 동작한다. 정적으로 구운 화면에는 nonce가 없어
 * 스크립트가 전부 막히고, 오류 없이 화면이 굳는다. 레이아웃이 `headers()`를 읽는 것이 그것을 보장한다.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, STATIC_SECURITY_HEADERS } from '../src/lib/security-headers';

const layout = readFileSync(join(__dirname, '../src/app/layout.tsx'), 'utf8');

describe('레이아웃', () => {
  it("★ headers()에서 x-nonce를 읽는다 — 그래야 모든 화면이 동적이다", () => {
    expect(layout).toMatch(/\(await headers\(\)\)\.get\('x-nonce'\)/);
  });

  it('★ 인라인 스크립트는 전부 nonce를 단다', () => {
    const scripts = layout.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag).toContain('nonce={nonce}');
  });
});

describe('contentSecurityPolicy', () => {
  it('배포본에는 eval·인라인 스크립트를 허용하지 않는다', () => {
    const csp = contentSecurityPolicy('abc', false);
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  it('개발 모드만 eval을 연다 (React 디버깅)', () => {
    expect(contentSecurityPolicy('abc', true)).toContain("'unsafe-eval'");
  });
});

describe('고정 보안 헤더', () => {
  it('클릭재킹·MIME 추측·리퍼러 노출을 막는다', () => {
    const keys = STATIC_SECURITY_HEADERS.map((h) => h.key);
    for (const k of [
      'X-Content-Type-Options',
      'X-Frame-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'Strict-Transport-Security',
    ]) {
      expect(keys).toContain(k);
    }
  });
});
