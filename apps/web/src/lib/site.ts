/**
 * 사이트 절대 주소.
 *
 * sitemap과 canonical에 필요하다. 도메인이 아직 정해지지 않았으므로
 * (`pc-builder-spec.md` §12) 환경변수로 받고, 없으면 개발 주소를 쓴다.
 *
 * **`NEXT_PUBLIC_SITE_URL`은 빌드 시점에 있어야 한다.** sitemap은 SSG라
 * 파일로 구워져 배포되므로, 런타임에만 넣으면 `localhost:3000`이 그대로
 * 색인에 올라간다. 오류가 나지 않아 알아차리기 어렵다.
 */
export function siteUrl(): string {
  return (process.env['NEXT_PUBLIC_SITE_URL'] ?? 'http://localhost:3000').replace(/\/$/, '');
}

/**
 * 부품 목록 밖의 공개 페이지들.
 *
 * sitemap이 카테고리별로만 나가 있어서 **첫 화면도 색인 목록에 없었다.**
 * 「검사 규칙」처럼 이 사이트에만 있는 글이 특히 그렇다.
 *
 * `/build/[code]`와 `/admin`은 넣지 않는다 — 공유 코드는 사용자가 만든 주소라
 * 수가 무한히 늘고, 어드민은 공개 페이지가 아니다 (robots.ts와 같은 판단).
 */
export const STATIC_PAGES: readonly { path: string; priority: number }[] = [
  { path: '/', priority: 1 },
  { path: '/part', priority: 0.8 },
  { path: '/rules', priority: 0.8 },
];

/** 정적 페이지를 담는 sitemap의 id. 카테고리 이름과 겹치지 않아야 한다 */
export const PAGES_SITEMAP_ID = 'pages';
