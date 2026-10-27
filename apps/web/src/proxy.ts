import { NextResponse, type NextRequest } from 'next/server';
import { adminGate } from '@/lib/admin-gate';
import { clientIp, RateLimiter } from '@/lib/rate-limit';
import { contentSecurityPolicy, newNonce } from '@/lib/security-headers';

/**
 * 모든 화면의 문지기 — CSP nonce·요청 제한(이슈 #115, ADR-0026)과 어드민 비밀(ADR-0020).
 *
 * `middleware.ts`가 아니라 `proxy.ts`다. 이름만 바뀐 게 아니라 **proxy는 Node에서
 * 돈다.** Edge 샌드박스의 `process.env`에는 빌드 때 아는 것만 담기므로, 미들웨어에
 * 두면 배포 환경변수로 넣은 비밀을 못 읽어 어드민이 영영 404가 된다.
 * (그래서 여기에 `runtime`을 적지 않는다 — proxy에는 세그먼트 설정을 못 쓴다.)
 * 같은 이유로 아래 요청 제한의 메모리도 프로세스 하나에 그대로 남는다.
 */

export const config = {
  /**
   * 빌드 산출물(해시가 붙은 정적 파일)만 뺀다. prefetch 요청을 빼라는 공식 예시는 따르지 않는다 —
   * 헤더 하나(`next-router-prefetch`)를 붙이면 어드민 검사를 비켜 가게 된다.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

/**
 * 서버 동작(검색·견적서 읽기·신고 등). 검색은 **글자마다** 부르므로 넉넉히 둔다 —
 * 120번을 몰아 쓰고 초당 4번씩 다시 찬다. 사람이 치는 속도로는 닿지 않는다.
 */
export const actionLimiter = new RateLimiter({ capacity: 120, refillPerSecond: 4 });

/**
 * 어드민 비밀이 틀린 응답. 첫 방문의 401(브라우저가 비밀을 묻게 하는 것)도 하나로 센다.
 * 20번을 쓰고 30초에 하나씩 찬다. 비밀이 16자 이상이라 맞히기는 원래 불가능하지만,
 * 막지 않으면 대입 시도가 그대로 서버 부하가 된다.
 */
export const adminFailLimiter = new RateLimiter({ capacity: 20, refillPerSecond: 1 / 30 });

const tooMany = () =>
  new NextResponse('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.\n', {
    status: 429,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'retry-after': '30',
    },
  });

/**
 * 요청 본문의 압축은 받지 않는다 — ADR-0030.
 *
 * 브라우저는 요청 본문을 압축해 보내지 않는다. 지금은 Caddy도 Next도 요청 본문을 풀지 않지만,
 * 풀어 주는 쪽이 생기면 공격자가 고른 압축 데이터가 압축 해제기에 들어간다 — 2026-10 Node 보안
 * 릴리스의 Brotli 해제 경계 밖 쓰기(CVE-2026-111497)가 그 경로다. 여기서 먼저 끊는다.
 * `identity`(압축 없음)는 받는다.
 */
export function hasEncodedBody(headers: { get(name: string): string | null }): boolean {
  const enc = headers.get('content-encoding');
  if (enc === null) return false;
  return enc.split(',').some((c) => {
    const t = c.trim().toLowerCase();
    return t !== '' && t !== 'identity';
  });
}

const unsupportedEncoding = () =>
  new NextResponse('압축된 요청 본문은 받지 않습니다.\n', {
    status: 415,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'accept-encoding': 'identity',
    },
  });

function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

export function proxy(req: NextRequest): NextResponse {
  if (hasEncodedBody(req.headers)) return unsupportedEncoding();

  const ip = clientIp(req.headers);

  if (req.method === 'POST' && req.headers.has('next-action') && !actionLimiter.take(ip)) {
    return tooMany();
  }

  const nonce = newNonce();
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV === 'development');
  // Next는 **요청** 헤더의 CSP에서 nonce를 읽어 자기 스크립트에 붙인다. 응답 헤더는 브라우저용이다
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);
  const withCsp = (res: NextResponse): NextResponse => {
    res.headers.set('content-security-policy', csp);
    return res;
  };

  if (!isAdminPath(req.nextUrl.pathname)) {
    return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  // 막힌 IP는 비밀이 맞는지 보기 전에 돌려보낸다. 맞혀 보는 것 자체를 멈추게 한다
  if (!adminFailLimiter.allowed(ip)) return tooMany();

  const gate = adminGate({
    token: process.env['ADMIN_TOKEN'],
    isProduction: process.env.NODE_ENV === 'production',
    authorization: req.headers.get('authorization'),
  });

  if (gate === 'ok' || gate === 'open') {
    const res = withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
    // 어드민 화면은 어디에도 남기지 않는다
    res.headers.set('cache-control', 'no-store');
    res.headers.set('x-robots-tag', 'noindex, nofollow');
    return res;
  }

  if (gate === 'disabled') {
    // 꺼져 있으면 그런 주소가 없는 것처럼 둔다. 없는 경로로 넘겨 앱의 404를 그대로 쓴다.
    return withCsp(
      NextResponse.rewrite(new URL('/__admin-off', req.url), { request: { headers: requestHeaders } }),
    );
  }

  adminFailLimiter.take(ip);
  return new NextResponse('인증이 필요합니다.\n', {
    status: 401,
    headers: {
      // 아이디 칸은 비워도 된다. 계정이 아니라 공유 비밀이다.
      'www-authenticate': 'Basic realm="buildfit admin", charset="UTF-8"',
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
