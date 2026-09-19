import type { MetadataRoute } from 'next';
import { slugsInCategory } from '@buildfit/db/part';
import { INDEXED_CATEGORIES } from '@/lib/categories';
import { getDb } from '@/lib/db';
import { siteUrl } from '@/lib/site';

/**
 * 카테고리마다 sitemap을 하나씩 낸다.
 *
 * 부품이 2만 건이 넘어 한 파일에 담으면 무겁다. 카테고리 단위로 쪼개면 각각
 * 수천 건이고, 갱신도 카테고리별로 독립적이다.
 *
 * **`/build/[code]`와 `/admin`은 넣지 않는다.** 공유 코드는 사용자가 만든 것이라
 * 색인 대상이 아니고, 어드민은 공개 페이지가 아니다.
 */
export async function generateSitemaps() {
  return INDEXED_CATEGORIES.map((category) => ({ id: category.toLowerCase() }));
}

export default async function sitemap({
  id,
}: {
  // Next 16은 이 인자를 Promise로 넘긴다. 그냥 쓰면 객체와 문자열을 비교하게 되고,
  // 오류 없이 빈 sitemap이 나간다 — 색인이 통째로 비는데 아무도 모른다.
  // 버전에 따라 문자열일 수도 있어 양쪽을 받는다.
  id: string | Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const resolvedId = await id;
  const category = INDEXED_CATEGORIES.find((c) => c.toLowerCase() === resolvedId);
  if (!category) return [];

  let rows: { slug: string; updatedAt: Date }[] = [];
  try {
    rows = await slugsInCategory(getDb(), category, { limit: 50000 });
  } catch (err) {
    // 빌드 중이면 던진다. 이 함수는 SSG라 결과가 파일로 구워져 배포된다.
    // 여기서 삼키면 **빈 sitemap이 그대로 배포되고 아무도 모른다** — 위 주석이
    // 걱정한 바로 그 상황이다. 요청 시점의 실패와 배포물의 결함은 다른 문제다.
    if (process.env.NEXT_PHASE === 'phase-production-build') throw err;
    // 요청 시점이라면 빈 sitemap을 내는 것이 500을 내는 것보다 낫다.
    return [];
  }

  return [
    {
      url: `${base}/part/${resolvedId}`,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    ...rows.map((r) => ({
      url: `${base}/part/${resolvedId}/${r.slug}`,
      lastModified: r.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),
  ];
}
