import Link from 'next/link';
import { categoryCounts } from '@buildfit/db/part';
import { searchAcrossCategories, type AcrossCategories } from '@buildfit/db/search';
import { PartIcon } from '@/components/Icons';
import { Container } from '@/components/SiteShell';
import { INDEXED_CATEGORIES, CATEGORY_LABELS, categoryLabel } from '@/lib/categories';
import { MAX_QUERY_CHARS } from '@/lib/picker';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '부품 목록',
  description: 'CPU·메인보드·메모리·그래픽카드·케이스·파워 스펙과 호환 정보.',
};

export default async function PartIndex({
  searchParams,
}: {
  // Next는 `?q=a&q=b`면 배열을 준다. `string`이라고 적으면 타입이 거짓말한다.
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q: rawQ } = await searchParams;
  const q = (Array.isArray(rawQ) ? rawQ[0] : rawQ)?.slice(0, MAX_QUERY_CHARS) ?? '';

  let counts: { category: string; total: number }[] = [];
  let found: AcrossCategories | null = null;
  try {
    const db = getDb();
    [counts, found] = await Promise.all([
      categoryCounts(db),
      // 검색어가 없으면 찾지 않는다. 카테고리를 훑는 화면이 기본이다.
      q.trim() === ''
        ? Promise.resolve(null)
        : searchAcrossCategories(db, { query: q, categories: INDEXED_CATEGORIES }),
    ]);
  } catch {
    counts = [];
  }
  const byCategory = new Map(counts.map((c) => [c.category, c.total]));

  return (
    <Container width="narrow" className="py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">부품</h1>
      <p className="mt-2 text-fg-muted">
        스펙과 호환 정보를 부품별로 봅니다. 조합의 판정은{' '}
        <Link href="/" className="link">
          견적 구성
        </Link>
        에서 합니다.
      </p>

      {/*
        * 카테고리를 고르지 않으면 아무것도 찾을 수 없었다. 「9800X3D」가 CPU인
        * 줄 아는 사람에게만 쓸모 있는 구조다. 여기서 가로질러 찾는다.
        */}
      <form action="/part" className="mt-6 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          maxLength={MAX_QUERY_CHARS}
          placeholder="모델명·한글 이름으로 전체 검색 (9800x3d, 리안리)"
          aria-label="부품 전체 검색"
          className="field min-w-0 flex-1"
        />
        <button type="submit" className="btn btn-primary shrink-0">
          검색
        </button>
      </form>

      {found && <SearchResults q={q} found={found} />}

      <h2 className="mt-10 text-sm font-semibold text-fg-muted">카테고리로 보기</h2>
      <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {Object.keys(CATEGORY_LABELS).map((category) => {
          const total = byCategory.get(category) ?? 0;
          const label = (
            <>
              <span className="flex min-w-0 items-center gap-2.5">
                {/* 제품 사진이 없으므로 아이콘이 시각적 닻 노릇을 한다 (ADR-0015 §4) */}
                <PartIcon category={category} className="shrink-0 text-fg-subtle" />
                <span
                  className={`truncate font-medium ${total > 0 ? '' : 'text-fg-muted'}`}
                >
                  {categoryLabel(category)}
                </span>
              </span>
              <span className="shrink-0 text-sm text-fg-subtle tnum">
                {total > 0 ? `${total.toLocaleString()}개` : '아직 없음'}
              </span>
            </>
          );

          // 부품이 없는 카테고리는 링크를 걸지 않는다. 눌러도 빈 목록이고,
          // 그건 고장으로 읽힌다. 다룰 계획이라는 사실만 남긴다.
          return (
            <li key={category}>
              {total > 0 ? (
                <Link
                  href={`/part/${category.toLowerCase()}`}
                  className="card flex items-center justify-between gap-2 px-4 py-3.5 transition-colors hover:border-border-strong"
                >
                  {label}
                </Link>
              ) : (
                /*
                 * 흐리게(opacity) 처리하지 않는다. 글자 대비가 토큰이 보장하는
                 * 값 아래로 떨어지는데 대비 테스트는 토큰만 본다 (WCAG 1.4.3).
                 * 점선 테두리로 "아직 없음"을 말하고 글자는 그대로 읽히게 둔다.
                 */
                <div className="card flex items-center justify-between gap-2 border-dashed bg-surface-2 px-4 py-3.5">
                  {label}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* 왜 비어 있는 칸이 있는지 말한다. 말하지 않으면 빠뜨린 것으로 읽힌다 */}
      {Object.keys(CATEGORY_LABELS).some((c) => (byCategory.get(c) ?? 0) === 0) && (
        <p className="mt-4 text-xs leading-relaxed text-fg-subtle">
          점선 칸은 아직 다루지 않는 부품입니다. 판정에 쓸 데이터를 확보한 뒤에 넣습니다 —
          목록만 늘리는 것은 이 도구가 하는 일이 아닙니다.
        </p>
      )}
    </Container>
  );
}

/**
 * 가로지른 검색 결과.
 *
 * 카테고리마다 몇 개씩만 보여주고, 더 보려면 그 카테고리 목록으로 보낸다 —
 * 거기가 걸러보기와 쪽 넘기기를 이미 갖고 있다.
 */
function SearchResults({ q, found }: { q: string; found: AcrossCategories }) {
  const total = found.groups.reduce((n, g) => n + g.total, 0);

  return (
    <section aria-labelledby="search-heading" className="mt-6">
      <h2 id="search-heading" className="text-sm font-semibold">
        &ldquo;{q}&rdquo; 검색 결과{' '}
        <span className="font-normal text-fg-subtle tnum">{total.toLocaleString()}개</span>
      </h2>

      {/* 한글을 영문으로 바꿔 찾았으면 그렇다고 말한다 (ADR-0017) */}
      {found.translated.length > 0 && (
        <p className="mt-1.5 text-xs text-fg-subtle">
          한글을 바꿔 찾았습니다 — {found.translated.map((t) => `${t.from} → ${t.to}`).join(', ')}
        </p>
      )}
      {found.unknown.length > 0 && (
        <p className="mt-1.5 text-xs text-warn">
          {found.unknown.join(', ')}: 카탈로그에서 쓰지 않는 말입니다. 영문 모델명으로 쳐 보세요.
        </p>
      )}

      {found.groups.length === 0 ? (
        <p className="mt-3 text-sm text-fg-muted">해당하는 부품이 없습니다.</p>
      ) : (
        <div className="mt-3 space-y-4">
          {found.groups.map((g) => (
            <div key={g.category} className="card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <PartIcon category={g.category} className="shrink-0 text-fg-subtle" />
                  {categoryLabel(g.category)}
                  <span className="font-normal text-fg-subtle tnum">
                    {g.total.toLocaleString()}개
                  </span>
                </h3>
                {/* 더 보는 곳은 그 카테고리 목록이다. 거기에 쪽 넘기기가 있다 */}
                {g.total > g.items.length && (
                  <Link
                    href={`/part/${g.category.toLowerCase()}?q=${encodeURIComponent(q)}`}
                    className="link text-xs"
                  >
                    전부 보기
                  </Link>
                )}
              </div>
              <ul className="mt-2 divide-y divide-border">
                {g.items.map((p) => (
                  <li key={p.slug}>
                    <Link
                      href={`/part/${g.category.toLowerCase()}/${p.slug}`}
                      className="-mx-2 flex flex-wrap items-baseline gap-x-2 rounded-(--radius-control) px-2 py-2 transition-colors hover:bg-surface-2"
                    >
                      <span className="min-w-0 text-sm">{p.modelName}</span>
                      <span className="text-xs text-fg-subtle">
                        {p.brand ?? ''}
                        {p.releaseYear ? ` · ${p.releaseYear}년` : ''}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
