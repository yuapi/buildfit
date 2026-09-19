import Link from 'next/link';
import { notFound } from 'next/navigation';
import { partBySlug, type PartSpecRow } from '@buildfit/db/part';
import { Container } from '@/components/SiteShell';
import { categoryLabel } from '@/lib/categories';
import { getDb } from '@/lib/db';
import { specLabel, specValueText } from '@/lib/spec-labels';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ a: string; b: string }> }) {
  const { a, b } = await params;
  try {
    const db = getDb();
    const [left, right] = await Promise.all([partBySlug(db, a), partBySlug(db, b)]);
    if (!left || !right) return { title: 'buildfit' };
    return {
      title: `${left.modelName} vs ${right.modelName} — buildfit`,
      description: `${left.modelName}와 ${right.modelName}의 스펙을 나란히 비교합니다.`,
    };
  } catch {
    return { title: 'buildfit' };
  }
}

/** 두 부품의 스펙을 한 줄씩 맞춘다. 한쪽에만 있는 항목도 빠뜨리지 않는다. */
function alignSpecs(left: readonly PartSpecRow[], right: readonly PartSpecRow[]) {
  const byKeyL = new Map(left.map((s) => [s.key, s]));
  const byKeyR = new Map(right.map((s) => [s.key, s]));
  const keys = [...new Set([...byKeyL.keys(), ...byKeyR.keys()])].sort();
  return keys.map((key) => {
    const l = byKeyL.get(key);
    const r = byKeyR.get(key);
    const lText = l ? specValueText(l.value, l.unit) : null;
    const rText = r ? specValueText(r.value, r.unit) : null;
    return { key, l, r, lText, rText, differs: lText !== rText };
  });
}

export default async function ComparePage({
  params,
}: {
  params: Promise<{ a: string; b: string }>;
}) {
  const { a, b } = await params;

  let left, right;
  try {
    const db = getDb();
    [left, right] = await Promise.all([partBySlug(db, a), partBySlug(db, b)]);
  } catch {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-xl font-semibold">지금은 비교할 수 없습니다</h1>
        <p className="mt-2 text-sm text-fg-muted">
          잠시 후 다시 시도해 주세요.
        </p>
      </main>
    );
  }

  if (!left || !right) notFound();
  // 카테고리가 다르면 비교가 성립하지 않는다. §8의 "의미 있는 조합만"이다.
  if (left.category !== right.category) notFound();
  if (left.slug === right.slug) notFound();

  const rows = alignSpecs(left.specs, right.specs);
  const differing = rows.filter((r) => r.differs).length;
  const catPath = left.category.toLowerCase();

  return (
    <Container className="py-10 sm:py-14">
      <nav aria-label="위치" className="text-sm text-fg-subtle">
        <Link href="/part" className="link">
          부품
        </Link>
        <span className="mx-1.5">/</span>
        <Link href={`/part/${catPath}`} className="link">
          {categoryLabel(left.category)}
        </Link>
      </nav>

      <h1 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
        {left.modelName} <span className="font-normal text-fg-subtle">vs</span> {right.modelName}
      </h1>
      <p className="mt-2 text-sm text-fg-muted">
        스펙 {rows.length}개 중 <strong className="font-medium text-fg tnum">{differing}개</strong>가
        다릅니다. 조합의 호환성은{' '}
        <Link href="/" className="link">
          견적 구성
        </Link>
        에서 판정합니다.
      </p>

      <div className="card mt-6 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="w-36 px-4 py-3 font-medium text-fg-subtle">항목</th>
              <th className="px-3 py-3 font-medium">
                <Link href={`/part/${catPath}/${left.slug}`} className="link">
                  {left.modelName}
                </Link>
              </th>
              <th className="px-4 py-3 font-medium">
                <Link href={`/part/${catPath}/${right.slug}`} className="link">
                  {right.modelName}
                </Link>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className={`border-b border-border last:border-0 ${
                  row.differs ? '' : 'text-fg-muted'
                }`}
              >
                <th scope="row" className="px-4 py-2.5 text-left align-top font-normal text-fg-subtle">
                  {specLabel(row.key)}
                </th>
                <td className={`px-3 py-2.5 align-top break-words ${row.differs ? 'font-medium text-fg' : ''}`}>
                  {/* 한쪽에만 있는 항목은 "없음"이 아니라 "정보 없음"이다.
                      값이 0이라는 뜻으로 읽히면 안 된다. */}
                  {row.lText ?? <span className="text-fg-subtle">정보 없음</span>}
                </td>
                <td className={`px-4 py-2.5 align-top break-words ${row.differs ? 'font-medium text-fg' : ''}`}>
                  {row.rText ?? <span className="text-fg-subtle">정보 없음</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Container>
  );
}
