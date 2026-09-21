import { NextResponse, type NextRequest } from 'next/server';
import { adminGate } from '@/lib/admin-gate';

/**
 * 어드민 문지기 — ADR-0020.
 *
 * `middleware.ts`가 아니라 `proxy.ts`다. 이름만 바뀐 게 아니라 **proxy는 Node에서
 * 돈다.** Edge 샌드박스의 `process.env`에는 빌드 때 아는 것만 담기므로, 미들웨어에
 * 두면 배포 환경변수로 넣은 비밀을 못 읽어 어드민이 영영 404가 된다.
 * (그래서 여기에 `runtime`을 적지 않는다 — proxy에는 세그먼트 설정을 못 쓴다.)
 */

export const config = {
  /** 어드민만 본다. 공개 화면은 건드리지 않는다 — 전부 통과시키면 응답마다 값을 치른다. */
  matcher: ['/admin', '/admin/:path*'],
};

export function proxy(req: NextRequest): NextResponse {
  const gate = adminGate({
    token: process.env['ADMIN_TOKEN'],
    isProduction: process.env.NODE_ENV === 'production',
    authorization: req.headers.get('authorization'),
  });

  if (gate === 'ok' || gate === 'open') return NextResponse.next();

  if (gate === 'disabled') {
    // 꺼져 있으면 그런 주소가 없는 것처럼 둔다. 없는 경로로 넘겨 앱의 404를 그대로 쓴다.
    return NextResponse.rewrite(new URL('/__admin-off', req.url));
  }

  return new NextResponse('어드민 비밀이 필요합니다.\n', {
    status: 401,
    headers: {
      // 아이디 칸은 비워도 된다. 계정이 아니라 공유 비밀이다.
      'www-authenticate': 'Basic realm="buildfit admin", charset="UTF-8"',
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
