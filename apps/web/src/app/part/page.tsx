import Link from 'next/link';
import { categoryCounts } from '@buildfit/db/part';
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
          return (
            <li key={category}>
              <Link
                href={`/part/${category.toLowerCase()}`}
                className="card flex items-baseline justify-between gap-2 px-4 py-3.5 transition-colors hover:border-border-strong"
              >
                <span className="font-medium">{categoryLabel(category)}</span>
                <span className="text-sm text-fg-subtle tnum">
                  {total > 0 ? `${total.toLocaleString()}개` : '준비 중'}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Container>
  );
}
