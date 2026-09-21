import Link from 'next/link';
import { notFound } from 'next/navigation';
import { partBySlug } from '@buildfit/db/part';
import { Container } from '@/components/SiteShell';
import { startBuildHref } from '@/lib/build-links';
import { alignSpecs } from '@/lib/compare';
import { categoryLabel } from '@/lib/categories';
import { getDb } from '@/lib/db';
import { specLabel, specValueText } from '@/lib/spec-labels';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ a: string; b: string }> }) {
  const { a, b } = await params;
  try {
    const db = getDb();
    const [left, right] = await Promise.all([partBySlug(db, a), partBySlug(db, b)]);
    if (!left || !right) return { title: { absolute: 'buildfit' } };
    return {
      title: `${left.modelName} vs ${right.modelName}`,
      description: `${left.modelName}와 ${right.modelName}의 스펙을 나란히 비교합니다.`,
    };
  } catch {
    return { title: { absolute: 'buildfit' } };
  }
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

  const rows = alignSpecs(left.specs, right.specs, (r) => specValueText(r.value, r.unit));
  const differing = rows.filter((r) => r.differs).length;
  const catPath = left.category.toLowerCase();
  const leftBuild = startBuildHref(left.category, left.id);
  const rightBuild = startBuildHref(right.category, right.id);

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
                  {/* 굵은 글씨만으로 차이를 표시하면 훑을 때 놓친다. 글자로 적는다 */}
                  {row.differs && <span className="chip mt-1 block w-fit">다름</span>}
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

      {/*
        * 비교만 하고 떠나게 두지 않는다. 이 도구가 하는 일은 판정이고,
        * 비교는 그 앞 단계다. 부품 상세 페이지와 같은 길을 여기도 둔다.
        */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {leftBuild && (
          <Link href={leftBuild} className="btn btn-secondary justify-start">
            <span className="truncate">{left.modelName}로 견적 시작</span>
          </Link>
        )}
        {rightBuild && (
          <Link href={rightBuild} className="btn btn-secondary justify-start">
            <span className="truncate">{right.modelName}로 견적 시작</span>
          </Link>
        )}
      </div>
    </Container>
  );
}
