/**
 * 보안 헤더 — 이슈 #115, ADR-0026.
 *
 * CSP는 **요청마다 새 nonce**를 쓴다 (Next 공식 방식). 인라인 스크립트는 nonce가 맞는 것만
 * 돈다 — Next가 자기 스크립트에 nonce를 붙이고, 우리 것(테마 부트스트랩)은 레이아웃이 붙인다.
 * 그래서 모든 화면이 동적 렌더링이다. 정적으로 구운 화면은 nonce가 없어 스크립트가 막힌다 —
 * 레이아웃이 `headers()`를 읽어 전부 동적으로 만든다.
 *
 * 외부 출처는 하나도 없다. 글꼴은 `next/font`가 빌드 때 받아 우리 서버에서 낸다.
 * **외부 서비스를 붙이면 여기에 주소를 더해야 한다.**
 */

export function contentSecurityPolicy(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    // 'strict-dynamic': nonce가 맞는 스크립트가 불러온 청크도 돈다. 개발 모드의 React는 eval을 쓴다
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // 스타일은 인라인을 허용한다 — React의 style 속성과 Next가 넣는 <style>이 있다.
    // 스타일 주입으로 할 수 있는 일은 스크립트보다 훨씬 좁다
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // 개발 모드의 HMR이 웹소켓을 쓴다
    `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** 요청마다 새로 만드는 nonce. 맞히지 못해야 하므로 암호학적 난수다 */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * 모든 응답에 붙이는 나머지 헤더 (`next.config.ts`의 `headers()`).
 *
 * HSTS는 HTTPS로 받을 때만 브라우저가 따른다. 로컬 http 시험에는 영향이 없다.
 */
export const STATIC_SECURITY_HEADERS: readonly { key: string; value: string }[] = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
];
