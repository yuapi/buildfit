import Link from 'next/link';
import { notFound } from 'next/navigation';
import { partBySlug, partsMatchingSpec, type RelatedPart } from '@buildfit/db/part';
import { encodeBuildCode } from '@/lib/build-code';
import { SLOT_META } from '@/lib/categories';
import { getDb } from '@/lib/db';
import { specLabel, specValueText } from '@/lib/spec-labels';
import { ReportForm } from './ReportForm';

export const dynamic = 'force-dynamic';

const OPENDB_REPO = 'https://github.com/buildcores/buildcores-open-db';

/** 이 부품 하나만 담은 견적 코드. 상세에서 바로 구성으로 넘어간다. */
function startBuildHref(category: string, id: string): string | null {
  const slot = SLOT_META.find((m) => m.category === category)?.slot;
  if (!slot) return null;
  const sel = slot === 'ram' ? { ram: [id] } : { [slot]: id };
  return `/build/${encodeBuildCode(sel)}`;
}

/**
 * 호환 목록 (§8).
 *
 * **판정이 아니라 단순 대조다.** 소켓이 같다고 조합이 성립한다는 뜻이 아니므로
 * 화면에도 그렇게 적는다. 배열 스펙(케이스의 지원 폼팩터 등)은 아직 다루지 않는다.
 */
async function relatedParts(
  category: string,
  id: string,
  specs: readonly { key: string; value: unknown }[],
): Promise<{ label: string; note: string; items: RelatedPart[] } | null> {
  const socket = specs.find((s) => s.key === 'socket')?.value;
  if (!socket) return null;

  if (category === 'CPU') {
    return {
      label: `소켓이 같은 메인보드`,
      note: '소켓만 대조한 목록입니다. 메모리 규격 등 나머지는 견적 도구에서 판정합니다.',
      items: await partsMatchingSpec(getDb(), {
        category: 'Motherboard',
        specKey: 'socket',
        value: socket,
      }),
    };
  }
  if (category === 'Motherboard') {
    return {
      label: `소켓이 같은 CPU`,
      note: '소켓만 대조한 목록입니다. BIOS 버전 등 나머지는 견적 도구에서 판정합니다.',
      items: await partsMatchingSpec(getDb(), {
        category: 'CPU',
        specKey: 'socket',
        value: socket,
        excludePartId: id,
      }),
    };
  }
  return null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const part = await partBySlug(getDb(), slug);
    if (!part) return { title: '부품을 찾을 수 없습니다 — buildfit' };
    return {
      title: `${part.modelName} 스펙 — buildfit`,
      description: `${part.modelName}의 스펙과 호환 정보. 조합의 호환성과 소비전력을 판정합니다.`,
    };
  } catch {
    return { title: 'buildfit' };
  }
}

export default async function PartPage({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}) {
  const { category, slug } = await params;

  let part;
  try {
    part = await partBySlug(getDb(), slug);
  } catch {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-xl font-semibold">지금은 부품 정보를 불러올 수 없습니다</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          잠시 후 다시 시도해 주세요.
        </p>
      </main>
    );
  }
  // 주소를 정본으로 유지한다. 카테고리가 어긋나면 그 주소는 없는 것으로 본다.
  if (!part || part.category.toLowerCase() !== category.toLowerCase()) notFound();

  const related = await relatedParts(part.category, part.id, part.specs);
  const buildHref = startBuildHref(part.category, part.id);
  const sourceUrl = part.specs.find((s) => s.sourceUrl)?.sourceUrl ?? null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <nav className="text-sm text-neutral-500">
        <Link href="/" className="underline underline-offset-2">
          견적 구성
        </Link>
        <span className="mx-2">·</span>
        <span>{part.category}</span>
      </nav>

      <h1 className="mt-4 text-2xl font-semibold">{part.modelName}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {part.brand ?? '제조사 미상'}
        {part.releaseYear ? ` · ${part.releaseYear}년` : ''}
        {part.discontinued ? ' · 단종' : ''}
      </p>

      {buildHref && (
        <Link
          href={buildHref}
          className="mt-4 inline-block rounded bg-neutral-900 px-3 py-1.5 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          이 부품으로 견적 시작
        </Link>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-medium">스펙</h2>
        {part.specs.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">아직 등록된 스펙이 없습니다.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <tbody>
              {part.specs.map((s) => (
                <tr key={s.key} className="border-b border-neutral-200 dark:border-neutral-800">
                  <td className="w-44 py-2 pr-4 align-top text-neutral-500">{specLabel(s.key)}</td>
                  <td className="py-2 pr-4 align-top break-words">
                    {specValueText(s.value, s.unit)}
                    {/* 신고가 들어온 값은 "검증 중"으로 표시한다 (§5.5) */}
                    {s.disputed && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-400">
                        검증 중
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right align-top text-xs whitespace-nowrap text-neutral-500">
                    {s.sourceUrl ? (
                      <a href={s.sourceUrl} className="underline underline-offset-2">
                        출처
                      </a>
                    ) : (
                      '출처 없음'
                    )}
                    {s.verifiedAt ? ` · ${s.verifiedAt.toISOString().slice(0, 10)} 확인` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="mt-4">
          <ReportForm
            partId={part.id}
            slug={part.slug}
            category={part.category}
            specKeys={part.specs.map((s) => s.key)}
          />
        </div>
      </section>

      {related && related.items.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-medium">{related.label}</h2>
          <p className="mt-1 text-xs text-neutral-500">{related.note}</p>
          <ul className="mt-3 grid gap-1 sm:grid-cols-2">
            {related.items.map((r) => (
              <li key={r.slug} className="truncate text-sm">
                <Link
                  href={`/part/${r.category.toLowerCase()}/${r.slug}`}
                  className="underline underline-offset-2"
                >
                  {r.modelName}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ODC-By 1.0은 출처 표기가 유일한 조건이다. 부품 상세에 표기 영역을 둔다 (§5.7) */}
      <footer className="mt-16 border-t border-neutral-200 pt-6 text-xs text-neutral-500 dark:border-neutral-800">
        이 부품의 스펙은{' '}
        <a href={OPENDB_REPO} className="underline underline-offset-2">
          BuildCores OpenDB
        </a>
        에서 가져왔습니다. Open Data Commons Attribution License (ODC-By) v1.0.
        {sourceUrl && (
          <>
            {' '}
            <a href={sourceUrl} className="underline underline-offset-2">
              원본 레코드
            </a>
          </>
        )}
        {part.mpn && <span className="ml-2">MPN {part.mpn}</span>}
      </footer>
    </main>
  );
}
