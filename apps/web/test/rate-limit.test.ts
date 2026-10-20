/**
 * 요청 제한 — 이슈 #115.
 */
import { describe, expect, it } from 'vitest';
import { clientIp, RateLimiter } from '../src/lib/rate-limit';

describe('RateLimiter', () => {
  it('가득 찬 만큼 쓰고, 시간이 지나면 다시 찬다', () => {
    const l = new RateLimiter({ capacity: 3, refillPerSecond: 1 });
    expect([l.take('a', 0), l.take('a', 0), l.take('a', 0), l.take('a', 0)]).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(l.take('a', 999)).toBe(false);
    expect(l.take('a', 1000)).toBe(true);
  });

  it('키마다 따로 센다', () => {
    const l = new RateLimiter({ capacity: 1, refillPerSecond: 0.001 });
    expect(l.take('a', 0)).toBe(true);
    expect(l.take('a', 0)).toBe(false);
    expect(l.take('b', 0)).toBe(true);
  });

  it('allowed는 쓰지 않는다', () => {
    const l = new RateLimiter({ capacity: 1, refillPerSecond: 0.001 });
    expect(l.allowed('a', 0)).toBe(true);
    expect(l.allowed('a', 0)).toBe(true);
    expect(l.take('a', 0)).toBe(true);
    expect(l.allowed('a', 0)).toBe(false);
  });

  it('★ 기억하는 IP 수가 상한을 넘지 않는다 — 주소를 바꿔 가며 메모리를 채울 수 없다', () => {
    const l = new RateLimiter({ capacity: 1, refillPerSecond: 0.001, maxKeys: 100 });
    for (let i = 0; i < 1000; i += 1) l.take(`ip-${i}`, 0);
    expect((l as unknown as { buckets: Map<string, unknown> }).buckets.size).toBeLessThanOrEqual(100);
  });
});

describe('clientIp', () => {
  const h = (o: Record<string, string>) => new Headers(o);

  it('★ X-Forwarded-For의 맨 오른쪽 — 왼쪽은 클라이언트가 지어낼 수 있다', () => {
    expect(clientIp(h({ 'x-forwarded-for': '1.1.1.1, 203.0.113.5' }))).toBe('203.0.113.5');
    expect(clientIp(h({ 'x-forwarded-for': '203.0.113.5' }))).toBe('203.0.113.5');
  });

  it('없으면 x-real-ip, 그것도 없으면 하나로 묶는다', () => {
    expect(clientIp(h({ 'x-real-ip': '203.0.113.6' }))).toBe('203.0.113.6');
    expect(clientIp(h({}))).toBe('unknown');
  });
});
