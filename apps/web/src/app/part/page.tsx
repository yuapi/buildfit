import Link from 'next/link';
import { categoryCounts } from '@buildfit/db/part';
import { PartIcon } from '@/components/Icons';
import { Container } from '@/components/SiteShell';
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
    <Container width="narrow" className="py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">부품</h1>
      <p className="mt-2 text-fg-muted">
        스펙과 호환 정보를 부품별로 봅니다. 조합의 판정은{' '}
        <Link href="/" className="link">
          견적 구성
        </Link>
        에서 합니다.
      </p>

      <ul className="mt-8 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
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
