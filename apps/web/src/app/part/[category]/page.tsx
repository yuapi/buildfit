import Link from 'next/link';
import { notFound } from 'next/navigation';
import { partsInCategory } from '@buildfit/db/part';
import { Container } from '@/components/SiteShell';
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
      <Container width="narrow" className="py-20">
        <h1 className="text-2xl font-semibold tracking-tight">지금은 목록을 불러올 수 없습니다</h1>
        <p className="mt-2 text-fg-muted">잠시 후 다시 시도해 주세요.</p>
      </Container>
    );
  }

  const lastPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const href = (n: number) =>
    `/part/${category.toLowerCase()}?page=${n}${q ? `&q=${encodeURIComponent(q)}` : ''}`;

  return (
    <Container width="narrow" className="py-10 sm:py-14">
      <nav aria-label="위치" className="text-sm text-fg-subtle">
        <Link href="/part" className="link">
          부품
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-fg-muted">{categoryLabel(resolved)}</span>
      </nav>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
        {categoryLabel(resolved)}
      </h1>
      <p className="mt-1 text-sm text-fg-subtle tnum">
        {result.total.toLocaleString()}개{q ? ` · "${q}" 검색 결과` : ''}
      </p>

      <form action={`/part/${category.toLowerCase()}`} className="mt-5 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="모델명·한글 이름으로 검색"
          aria-label="모델명으로 검색"
          className="field min-w-0 flex-1"
        />
        <button type="submit" className="btn btn-primary shrink-0">
          검색
        </button>
      </form>

      {/* 한글을 영문으로 바꿔 찾았으면 그렇다고 말한다 (ADR-0017) */}
      {result.translated.length > 0 && (
        <p className="mt-2 text-xs text-fg-subtle">
          한글을 바꿔 찾았습니다 — {result.translated.map((t) => `${t.from} → ${t.to}`).join(', ')}
        </p>
      )}
      {result.unknown.length > 0 && (
        <p className="mt-2 text-xs text-warn">
          {result.unknown.join(', ')}: 카탈로그에서 쓰지 않는 말입니다. 영문 모델명으로 쳐 보세요.
        </p>
      )}

      {result.items.length === 0 ? (
        <p className="mt-10 text-sm text-fg-muted">
          해당하는 부품이 없습니다.
          {q && ' 검색어를 줄여 보세요.'}
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-border">
          {result.items.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/part/${category.toLowerCase()}/${p.slug}`}
                className="-mx-2 flex flex-wrap items-baseline gap-x-2 rounded-(--radius-control) px-2 py-2.5 transition-colors hover:bg-surface-2"
              >
                <span className="text-sm font-medium">{p.modelName}</span>
                <span className="text-xs text-fg-subtle">
                  {p.brand ?? ''}
                  {p.releaseYear ? ` · ${p.releaseYear}년` : ''}
                </span>
                {p.discontinued && <span className="chip">단종</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {lastPage > 1 && (
        <nav aria-label="페이지" className="mt-8 flex items-center gap-2 text-sm">
          {pageNo > 1 ? (
            <Link href={href(pageNo - 1)} className="btn btn-secondary">
              이전
            </Link>
          ) : (
            <span className="btn btn-secondary opacity-40">이전</span>
          )}
          <span className="px-2 text-fg-subtle tnum">
            {pageNo} / {lastPage}
          </span>
          {pageNo < lastPage ? (
            <Link href={href(pageNo + 1)} className="btn btn-secondary">
              다음
            </Link>
          ) : (
            <span className="btn btn-secondary opacity-40">다음</span>
          )}
        </nav>
      )}
    </Container>
  );
}
