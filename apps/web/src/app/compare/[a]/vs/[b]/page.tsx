import Link from 'next/link';
import { notFound } from 'next/navigation';
import { partBySlug, type PartSpecRow } from '@buildfit/db/part';
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
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
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
    <main className="mx-auto max-w-4xl px-4 py-10">
      <nav className="text-sm text-neutral-500">
        <Link href="/part" className="underline underline-offset-2">
          부품
        </Link>
        <span className="mx-2">·</span>
        <Link href={`/part/${catPath}`} className="underline underline-offset-2">
          {categoryLabel(left.category)}
        </Link>
      </nav>

      <h1 className="mt-4 text-xl font-semibold sm:text-2xl">
        {left.modelName} <span className="text-neutral-400">vs</span> {right.modelName}
      </h1>
      <p className="mt-2 text-sm text-neutral-500">
        스펙 {rows.length}개 중 {differing}개가 다릅니다. 조합의 호환성은{' '}
        <Link href="/" className="underline underline-offset-2">
          견적 구성
        </Link>
        에서 판정합니다.
      </p>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-300 text-left dark:border-neutral-700">
            <th className="w-40 py-2 font-medium text-neutral-500">항목</th>
            <th className="py-2 font-medium">
              <Link href={`/part/${catPath}/${left.slug}`} className="underline underline-offset-2">
                {left.modelName}
              </Link>
            </th>
            <th className="py-2 font-medium">
              <Link href={`/part/${catPath}/${right.slug}`} className="underline underline-offset-2">
                {right.modelName}
              </Link>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              className={`border-b border-neutral-200 dark:border-neutral-800 ${
                row.differs ? '' : 'text-neutral-500'
              }`}
            >
              <td className="py-2 pr-4 align-top text-neutral-500">{specLabel(row.key)}</td>
              <td className={`py-2 pr-4 align-top break-words ${row.differs ? 'font-medium' : ''}`}>
                {/* 한쪽에만 있는 항목은 "없음"이 아니라 "정보 없음"이다.
                    값이 0이라는 뜻으로 읽히면 안 된다. */}
                {row.lText ?? <span className="text-neutral-400">정보 없음</span>}
              </td>
              <td className={`py-2 align-top break-words ${row.differs ? 'font-medium' : ''}`}>
                {row.rText ?? <span className="text-neutral-400">정보 없음</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="mt-16 border-t border-neutral-200 pt-6 text-xs text-neutral-500 dark:border-neutral-800">
        스펙 출처:{' '}
        <a
          href="https://github.com/buildcores/buildcores-open-db"
          className="underline underline-offset-2"
        >
          BuildCores OpenDB
        </a>{' '}
        (ODC-By 1.0)
      </footer>
    </main>
  );
}
