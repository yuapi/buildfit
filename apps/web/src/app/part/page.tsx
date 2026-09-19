import Link from 'next/link';
import { categoryCounts } from '@buildfit/db/part';
import { CATEGORY_LABELS, categoryLabel } from '@/lib/categories';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '부품 목록 — buildfit',
  description: 'CPU·메인보드·메모리·그래픽카드·케이스·파워 스펙과 호환 정보.',
};

export default async function PartIndex() {
  let counts: { category: string; total: number }[] = [];
  try {
    counts = await categoryCounts(getDb());
  } catch {
    counts = [];
  }
  const byCategory = new Map(counts.map((c) => [c.category, c.total]));

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <nav className="text-sm text-neutral-500">
        <Link href="/" className="underline underline-offset-2">
          견적 구성
        </Link>
      </nav>

      <h1 className="mt-4 text-2xl font-semibold">부품</h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        스펙과 호환 정보를 부품별로 봅니다. 조합의 판정은 견적 구성에서 합니다.
      </p>

      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {Object.keys(CATEGORY_LABELS).map((category) => {
          const total = byCategory.get(category) ?? 0;
          return (
            <li key={category}>
              <Link
                href={`/part/${category.toLowerCase()}`}
                className="block rounded border border-neutral-300 p-4 hover:border-neutral-500 dark:border-neutral-700 dark:hover:border-neutral-500"
              >
                <span className="font-medium">{categoryLabel(category)}</span>
                <span className="ml-2 text-sm text-neutral-500">
                  {total > 0 ? `${total.toLocaleString()}개` : '—'}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
