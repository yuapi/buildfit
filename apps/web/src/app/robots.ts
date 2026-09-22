import type { MetadataRoute } from 'next';
import { INDEXED_CATEGORIES } from '@/lib/categories';
import { PAGES_SITEMAP_ID, siteUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // 어드민은 공개 페이지가 아니다. 공유 코드는 사용자가 만든 주소라
      // 색인 대상이 아니며, 수가 무한히 늘어난다. /healthz는 배포 플랫폼용이다.
      disallow: ['/admin', '/build/', '/healthz'],
    },
    sitemap: [
      // sitemap.ts의 generateSitemaps와 같은 목록이어야 한다. 빠지면 색인이
      // 그 파일을 못 찾는데 오류가 나지 않는다 — 테스트가 둘을 맞춘다.
      `${base}/sitemap/${PAGES_SITEMAP_ID}.xml`,
      ...INDEXED_CATEGORIES.map((c) => `${base}/sitemap/${c.toLowerCase()}.xml`),
    ],
  };
}
