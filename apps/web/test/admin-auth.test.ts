/**
 * 어드민의 두 번째 문지기 `requireAdmin` — ADR-0020.
 *
 * `admin-guard.test.ts`는 화면마다 `requireAdmin()`을 **부르는지** 본다. 이 파일은
 * 그 함수가 **실제로 막는지** 본다. 판정을 응답으로 옮기는 줄이 하나라도 뒤집히면
 * (예: `disabled`를 통과로) 미들웨어를 비껴간 요청이 그대로 어드민 데이터를 받는다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NOT_FOUND = new Error('NEXT_NOT_FOUND');
let authorization: string | null = null;

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers(authorization ? { authorization } : {}),
}));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw NOT_FOUND;
  }),
}));

const { requireAdmin } = await import('../src/lib/admin-auth');
const { notFound } = await import('next/navigation');

const TOKEN = 'admin-auth-test-secret-1234';
const basic = (secret: string) => `Basic ${Buffer.from(`admin:${secret}`).toString('base64')}`;

beforeEach(() => {
  authorization = null;
  vi.mocked(notFound).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('requireAdmin — 판정이 통과·404가 되는가', () => {
  it('맞는 비밀이면 통과한다 (ok)', async () => {
    vi.stubEnv('ADMIN_TOKEN', TOKEN);
    vi.stubEnv('NODE_ENV', 'production');
    authorization = basic(TOKEN);
    await expect(requireAdmin()).resolves.toBeUndefined();
    expect(notFound).not.toHaveBeenCalled();
  });

  it('개발 환경에서 비밀이 없으면 열린다 (open)', async () => {
    vi.stubEnv('ADMIN_TOKEN', '');
    vi.stubEnv('NODE_ENV', 'development');
    await expect(requireAdmin()).resolves.toBeUndefined();
  });

  it('★ 틀린 비밀이면 404 (unauthorized) — 도전은 미들웨어 몫이다', async () => {
    vi.stubEnv('ADMIN_TOKEN', TOKEN);
    vi.stubEnv('NODE_ENV', 'production');
    authorization = basic('wrong-secret-wrong-secret');
    await expect(requireAdmin()).rejects.toBe(NOT_FOUND);
    expect(notFound).toHaveBeenCalledOnce();
  });

  it('★ 비밀을 안 보내도 404 (unauthorized)', async () => {
    vi.stubEnv('ADMIN_TOKEN', TOKEN);
    vi.stubEnv('NODE_ENV', 'development');
    await expect(requireAdmin()).rejects.toBe(NOT_FOUND);
  });

  it('★ 배포본에 비밀이 없으면 404 (disabled) — 무엇을 보내도 열리지 않는다', async () => {
    vi.stubEnv('ADMIN_TOKEN', '');
    vi.stubEnv('NODE_ENV', 'production');
    authorization = basic('');
    await expect(requireAdmin()).rejects.toBe(NOT_FOUND);
  });
});
