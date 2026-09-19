import Link from 'next/link';
import { notFound } from 'next/navigation';
import { partsInCategory } from '@buildfit/db/part';
import { categoryFromSlug, categoryLabel } from '@/lib/categories';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 60;

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const resolved = categoryFromSlug(category);
  if (!resolved) return { title: 'buildfit' };
  return {
    title: `${categoryLabel(resolved)} 목록 — buildfit`,
    description: `${categoryLabel(resolved)} 스펙과 호환 정보를 찾아봅니다.`,
  };
}

export default async function CategoryIndex({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const { category } = await params;
  const { page, q } = await searchParams;

  const resolved = categoryFromSlug(category);
  if (!resolved) notFound();

  const pageNo = Math.max(1, Number(page ?? '1') || 1);
  let result;
  try {
    result = await partsInCategory(getDb(), resolved, {
      limit: PAGE_SIZE,
      offset: (pageNo - 1) * PAGE_SIZE,
      query: q ?? '',
    });
  } catch {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-xl font-semibold">지금은 목록을 불러올 수 없습니다</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          잠시 후 다시 시도해 주세요.
        </p>
      </main>
    );
  }

  const lastPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const href = (n: number) =>
    `/part/${category.toLowerCase()}?page=${n}${q ? `&q=${encodeURIComponent(q)}` : ''}`;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <nav className="text-sm text-neutral-500">
        <Link href="/" className="underline underline-offset-2">
          견적 구성
        </Link>
        <span className="mx-2">·</span>
        <Link href="/part" className="underline underline-offset-2">
          부품
        </Link>
      </nav>

      <h1 className="mt-4 text-2xl font-semibold">{categoryLabel(resolved)}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {result.total.toLocaleString()}개
        {q ? ` · "${q}" 검색 결과` : ''}
      </p>

      <form action={`/part/${category.toLowerCase()}`} className="mt-4 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="모델명으로 검색"
          className="min-w-0 flex-1 rounded border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700"
        />
        <button
          type="submit"
          className="shrink-0 rounded bg-neutral-900 px-3 py-1.5 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          검색
        </button>
      </form>

      {result.items.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-500">해당하는 부품이 없습니다.</p>
      ) : (
        <ul className="mt-6 divide-y divide-neutral-200 dark:divide-neutral-800">
          {result.items.map((p) => (
            <li key={p.slug} className="py-2">
              <Link
                href={`/part/${category.toLowerCase()}/${p.slug}`}
                className="text-sm underline underline-offset-2"
              >
                {p.modelName}
              </Link>
              <span className="ml-2 text-xs text-neutral-500">
                {p.brand ?? ''}
                {p.releaseYear ? ` · ${p.releaseYear}` : ''}
                {p.discontinued ? ' · 단종' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      {lastPage > 1 && (
        <nav className="mt-8 flex items-center gap-4 text-sm">
          {pageNo > 1 && (
            <Link href={href(pageNo - 1)} className="underline underline-offset-2">
              ← 이전
            </Link>
          )}
          <span className="text-neutral-500">
            {pageNo} / {lastPage}
          </span>
          {pageNo < lastPage && (
            <Link href={href(pageNo + 1)} className="underline underline-offset-2">
              다음 →
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
