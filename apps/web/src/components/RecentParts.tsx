'use client';

/**
 * 최근 본 부품 — 명세 §8A.1의 `recent_parts`.
 *
 * 저장 함수는 처음부터 있었는데 부르는 곳이 없어 아무것도 남지 않았다. 부품 페이지가
 * 본 것을 적고(`RecentPartRecorder`), 부품 목록 첫 화면이 그것을 보여준다.
 *
 * 이 브라우저에만 남는다. 서버로 가지 않는다.
 */

import Link from 'next/link';
import { useEffect, useSyncExternalStore } from 'react';
import { categoryLabel } from '@/lib/categories';
import {
  getServerStorageSnapshot,
  getStorageSnapshot,
  recordRecentPart,
  subscribeStorage,
} from '@/lib/storage';

/** 부품 페이지에 둔다. 그리는 것은 없다 */
export function RecentPartRecorder({
  id,
  category,
  name,
  slug,
}: {
  id: string;
  category: string;
  name: string;
  slug: string;
}) {
  useEffect(() => {
    // 저장 실패는 무시한다 — 편의 기능이다 (§8A.4)
    recordRecentPart({ id, category, name, slug });
  }, [id, category, name, slug]);
  return null;
}

/** 한 화면에 보여줄 수. 저장은 20개까지 한다 (§8A.1) */
const SHOWN = 8;

export function RecentParts() {
  // localStorage는 React 바깥의 스토어다. 서버 렌더에서는 빈 목록이라 칸이 없다
  const { recentParts } = useSyncExternalStore(
    subscribeStorage,
    getStorageSnapshot,
    getServerStorageSnapshot,
  );
  // 주소가 없는 것은 이을 수 없다 — slug는 나중에 더한 칸이다
  const items = recentParts.filter((p) => p.slug !== undefined).slice(0, SHOWN);
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="recent-parts-heading" className="mt-8">
      <h2 id="recent-parts-heading" className="text-sm font-semibold text-fg-muted">
        최근 본 부품
      </h2>
      <p className="mt-1 text-xs text-fg-subtle">이 브라우저에만 남습니다.</p>
      {/* grid-cols-1을 적어야 긴 모델명이 truncate된다 (부품 페이지와 같은 이유) */}
      <ul className="mt-2 grid grid-cols-1 gap-0.5 sm:grid-cols-2">
        {items.map((p) => (
          <li key={p.id}>
            <Link
              href={`/part/${p.category.toLowerCase()}/${p.slug}`}
              className="-mx-2 flex min-w-0 items-baseline gap-2 rounded-(--radius-control) px-2 py-1.5 text-sm transition-colors hover:bg-surface-2"
            >
              <span className="shrink-0 text-xs text-fg-subtle">{categoryLabel(p.category)}</span>
              <span className="min-w-0 truncate">{p.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
