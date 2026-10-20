/**
 * 요청 제한 — 이슈 #115.
 *
 * 로그인이 없어서(ADR-0001) 사람 단위로는 셀 수 없다. **IP 단위 토큰 버킷**으로 센다.
 * 프로세스 하나에 메모리로 둔다 — 캐시·큐를 두지 않는다 (ADR-0010). 재시작하면 비지만,
 * 막으려는 것은 몰아치는 요청이지 장기 누적이 아니다.
 *
 * 프레임워크에 기대지 않는 순수 모듈이다. 시각은 밖에서 받아 테스트가 시간을 돌린다.
 */

export interface BucketOptions {
  /** 한 번에 몰아 쓸 수 있는 수 */
  readonly capacity: number;
  /** 초당 다시 차는 수 */
  readonly refillPerSecond: number;
  /** 이보다 많은 IP를 기억하면 가득 찬 것부터 버린다. 메모리가 무한히 늘지 않게 */
  readonly maxKeys?: number;
}

interface Bucket {
  tokens: number;
  at: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly maxKeys: number;

  constructor(private readonly opts: BucketOptions) {
    this.maxKeys = opts.maxKeys ?? 10_000;
  }

  /** 하나를 쓴다. 남은 것이 없으면 `false` */
  take(key: string, now: number = Date.now()): boolean {
    const b = this.refill(key, now);
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  /** 쓰지 않고 남았는지만 본다 */
  allowed(key: string, now: number = Date.now()): boolean {
    return this.refill(key, now).tokens >= 1;
  }

  private refill(key: string, now: number): Bucket {
    let b = this.buckets.get(key);
    if (!b) {
      if (this.buckets.size >= this.maxKeys) this.sweep(now);
      b = { tokens: this.opts.capacity, at: now };
      this.buckets.set(key, b);
      return b;
    }
    const elapsed = Math.max(0, now - b.at) / 1000;
    b.tokens = Math.min(this.opts.capacity, b.tokens + elapsed * this.opts.refillPerSecond);
    b.at = now;
    return b;
  }

  /** 다시 가득 찼을 것들을 지운다. 그래도 넘치면 오래된 것부터 지운다 */
  private sweep(now: number): void {
    const full = (this.opts.capacity / this.opts.refillPerSecond) * 1000;
    for (const [k, b] of this.buckets) {
      if (now - b.at >= full) this.buckets.delete(k);
    }
    while (this.buckets.size >= this.maxKeys) {
      const oldest = this.buckets.keys().next();
      if (oldest.done) break;
      this.buckets.delete(oldest.value);
    }
  }
}

/**
 * 요청한 쪽의 IP.
 *
 * 앱은 127.0.0.1에만 열고 Caddy가 앞에 선다 (docs/oci-migration.md §4.6). Caddy는 밖에서 온
 * `X-Forwarded-For`를 믿지 않고 실제 접속 IP로 채우므로 **맨 오른쪽 값**이 Caddy가 본 IP다.
 * 왼쪽 값은 클라이언트가 지어낼 수 있다.
 */
export function clientIp(headers: { get(name: string): string | null }): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const last = xff.split(',').pop()?.trim();
    if (last) return last.slice(0, 64);
  }
  return headers.get('x-real-ip')?.trim().slice(0, 64) || 'unknown';
}
