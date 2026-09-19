/**
 * 사이트 절대 주소.
 *
 * sitemap과 canonical에 필요하다. 도메인이 아직 정해지지 않았으므로
 * (`pc-builder-spec.md` §12) 환경변수로 받고, 없으면 개발 주소를 쓴다.
 */
export function siteUrl(): string {
  return (process.env['NEXT_PUBLIC_SITE_URL'] ?? 'http://localhost:3000').replace(/\/$/, '');
}
