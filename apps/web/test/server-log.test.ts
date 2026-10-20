/**
 * 서버 쪽 오류를 로그에 남긴다 — T-21.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { logServerError, redact } = await import('../src/lib/server-log');

afterEach(() => vi.restoreAllMocks());

describe('logServerError', () => {
  it('어디서·코드·메시지를 한 줄로', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logServerError('/part', Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' }));
    expect(spy).toHaveBeenCalledWith('[buildfit] /part: [ECONNREFUSED] connect ECONNREFUSED 127.0.0.1:5432');
  });

  it('★ drizzle 이 감싼 오류는 원인을 앞에 보인다', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cause = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5999'), { code: 'ECONNREFUSED' });
    logServerError('/healthz', new Error('Failed query: select 1\nparams: ', { cause }));
    expect(spy).toHaveBeenCalledWith('[buildfit] /healthz: [ECONNREFUSED] connect ECONNREFUSED 127.0.0.1:5999 (Failed query: select 1)');
  });

  it('★ 접속 문자열의 비밀번호를 가린다', () => {
    expect(redact('bad url postgres://buildfit_app:s3cr3t@127.0.0.1:5432/db')).toBe(
      'bad url postgres://buildfit_app:***@127.0.0.1:5432/db',
    );
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logServerError('x', new Error('postgres://u:pw@h/d'));
    expect(String(spy.mock.calls[0]?.[0])).not.toContain('pw');
  });

  it('Next의 404·redirect 는 남기지 않는다', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logServerError('x', Object.assign(new Error('NEXT_HTTP_ERROR_FALLBACK;404'), { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' }));
    logServerError('x', Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/;307;' }));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('★ DB를 부르는 서버 파일은 오류를 삼키지 않는다', () => {
  const APP = join(import.meta.dirname, '../src/app');
  const walk = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
  const files = walk(APP).filter((f) => /\.(ts|tsx)$/.test(f)).filter((f) => {
    const t = readFileSync(f, 'utf8');
    return !t.startsWith("'use client'") && !t.startsWith('"use client"') && t.includes('getDb()') && /catch\s*(\(|\{)/.test(t);
  });

  it('검사할 파일을 찾았다', () => expect(files.length).toBeGreaterThanOrEqual(8));

  it.each(files.map((f) => [f.slice(APP.length + 1), f]))('%s 의 모든 catch 가 logServerError 를 부른다', (_n, f) => {
    const t = readFileSync(f, 'utf8');
    const bare = t.match(/\}\s*catch\s*\{/g) ?? [];
    expect(bare, '오류를 받지 않는 catch').toHaveLength(0);
    const catches = (t.match(/\}\s*catch\s*\(/g) ?? []).length;
    const logs = (t.match(/logServerError\(/g) ?? []).length;
    expect(logs).toBeGreaterThanOrEqual(catches);
  });
});
