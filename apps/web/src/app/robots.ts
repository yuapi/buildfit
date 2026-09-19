import type { MetadataRoute } from 'next';
import { INDEXED_CATEGORIES } from '@/lib/categories';
import { siteUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // 어드민은 공개 페이지가 아니다. 공유 코드는 사용자가 만든 주소라
      // 색인 대상이 아니며, 수가 무한히 늘어난다.
      disallow: ['/admin', '/build/'],
    },
    sitemap: INDEXED_CATEGORIES.map((c) => `${base}/sitemap/${c.toLowerCase()}.xml`),
  };
}
