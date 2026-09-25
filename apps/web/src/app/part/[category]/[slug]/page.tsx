import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requiredKeysFor } from '@buildfit/compat';
import { benchmarksForPart, comparableParts, partBySlug, partsMatchingSpec, type RelatedPart } from '@buildfit/db/part';
import { filledPartColumnKeys } from '@buildfit/db/queries';
import { BenchmarkBlock } from '@/components/BenchmarkBlock';
import { Container } from '@/components/SiteShell';
import { startBuildHref } from '@/lib/build-links';
import { categoryLabel } from '@/lib/categories';
import { getDb } from '@/lib/db';
import { specLabel, specValueText } from '@/lib/spec-labels';
import { ReportForm } from './ReportForm';

export const dynamic = 'force-dynamic';

const OPENDB_REPO = 'https://github.com/buildcores/buildcores-open-db';

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

function partHref(category: string, slug: string): string {
  return `/part/${category.toLowerCase()}/${slug}`;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const part = await partBySlug(getDb(), slug);
    if (!part) return { title: '부품을 찾을 수 없습니다' };
    return {
      title: `${part.modelName} 스펙`,
      description: `${part.modelName}의 스펙과 호환 정보. 조합의 호환성과 소비전력을 판정합니다.`,
      // 같은 제품이 여러 레코드로 들어 있다. 중복 페이지는 대표를 가리킨다 —
      // 그냥 두면 같은 내용의 페이지들이 서로 순위를 갉아먹는다.
      alternates: {
        canonical: partHref(part.category, part.canonicalSlug ?? part.slug),
      },
    };
  } catch {
    return { title: { absolute: 'buildfit' } };
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
      <Container width="narrow" className="py-20">
        <h1 className="text-2xl font-semibold tracking-tight">
          지금은 부품 정보를 불러올 수 없습니다
        </h1>
        <p className="mt-2 text-fg-muted">잠시 후 다시 시도해 주세요.</p>
      </Container>
    );
  }
  // 주소를 정본으로 유지한다. 카테고리가 어긋나면 그 주소는 없는 것으로 본다.
  if (!part || part.category.toLowerCase() !== category.toLowerCase()) notFound();

  // 값이 있는 항목뿐 아니라 **비어 있는 필수 항목**도 제보 대상이다.
  // 견적에서 "판정 불가"를 만난 사용자가 그 값을 알려줄 수 있어야 한다 (§5.5).
  // 출시 연도는 `parts` 컬럼에 있다. 스펙 키만 보면 연도가 있어도 비어 있다고 말한다 (이슈 #48)
  const have = new Set([...part.specs.map((s) => s.key), ...filledPartColumnKeys(part)]);
  const missingRequired = requiredKeysFor(part.category)
    .filter((r) => !have.has(r.specKey))
    .map((r) => r.specKey);

  const [related, comparable, benchmarks] = await Promise.all([
    relatedParts(part.category, part.id, part.specs),
    comparableParts(getDb(), part),
    // 측정값 테이블이 없는 DB(적재 전)에서도 페이지는 떠야 한다
    benchmarksForPart(getDb(), part.id).catch(() => []),
  ]);
  const measurable = part.category === 'CPU' || part.category === 'GPU';
  const buildHref = startBuildHref(part.category, part.id);
  const sourceUrl = part.specs.find((s) => s.sourceUrl)?.sourceUrl ?? null;

  return (
    <Container width="narrow" className="py-10 sm:py-14">
      <nav aria-label="위치" className="text-sm text-fg-subtle">
        <Link href="/part" className="link">
          부품
        </Link>
        <span className="mx-1.5">/</span>
        <Link href={`/part/${part.category.toLowerCase()}`} className="link">
          {categoryLabel(part.category)}
        </Link>
      </nav>

      <header className="mt-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{part.modelName}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="chip">{part.brand ?? '제조사 미상'}</span>
          {part.releaseYear && (
            <span className="chip tnum">
              {part.releaseYear}년
              {/* 소켓보다 앞선 연도는 검증 중이다 (이슈 #18). 머리 칩에서 확정처럼 보이면
                  아래 스펙 표의 표시를 보기 전에 믿는다 */}
              {part.specs.some((s) => s.key === 'release_year' && s.disputed) && (
                <span className="ml-1 text-fg-subtle">· 검증 중</span>
              )}
            </span>
          )}
          {part.discontinued && <span className="chip">단종</span>}
        </div>
        {buildHref && (
          <Link href={buildHref} className="btn btn-primary mt-4">
            이 부품으로 견적 시작
          </Link>
        )}
        {/*
          중복 레코드는 주소를 살려 둔다 (공유 링크가 담고 있다 — ADR-0012).
          다만 목록·검색에는 대표만 나오므로, 여기 온 사람에게 왜 둘이 있는지 알린다.
        */}
        {part.canonicalSlug && (
          <p className="mt-4 text-sm text-fg-muted">
            같은 제품이 원본 데이터에 여러 번 들어 있습니다. 대표 항목은{' '}
            <Link href={partHref(part.category, part.canonicalSlug)} className="link">
              여기
            </Link>
            입니다.
          </p>
        )}
      </header>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">스펙</h2>
        {part.specs.length === 0 ? (
          <p className="mt-2 text-sm text-fg-muted">아직 등록된 스펙이 없습니다.</p>
        ) : (
          <div className="card mt-3 overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {part.specs.map((s) => (
                  <tr key={s.key} className="border-b border-border last:border-0">
                    <th
                      scope="row"
                      className="w-40 px-4 py-2.5 text-left align-top font-normal text-fg-subtle"
                    >
                      {specLabel(s.key)}
                    </th>
                    <td className="px-2 py-2.5 align-top break-words">
                      {specValueText(s.value, s.unit)}
                      {/* 신고가 들어온 값은 "검증 중"으로 표시한다 (§5.5) */}
                      {s.disputed && <span className="chip ml-2">검증 중</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right align-top text-xs whitespace-nowrap text-fg-subtle">
                      {s.sourceUrl ? (
                        <a href={s.sourceUrl} className="link">
                          출처
                        </a>
                      ) : (
                        '출처 없음'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {missingRequired.length > 0 && (
          <div className="mt-4 rounded-(--radius-card) border border-warn-border bg-warn-bg p-4 text-sm">
            <p className="font-medium text-warn">
              호환성 판정에 필요한데 비어 있는 항목 {missingRequired.length}개
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-fg-muted">
              {missingRequired.map(specLabel).join(', ')}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-fg-subtle">
              이 값이 없으면 견적에서 &ldquo;판정 불가&rdquo;로 나옵니다. 아시는 값이 있으면
              아래에서 알려주세요.
            </p>
          </div>
        )}

        <div className="mt-4">
          <ReportForm
            partId={part.id}
            slug={part.slug}
            category={part.category}
            specKeys={part.specs.map((s) => s.key)}
            missingKeys={missingRequired}
          />
        </div>
      </section>

      {/* 성능 측정값 — ADR-0023. CPU·GPU만. 없으면 없다고 적는다 */}
      {measurable && (
        <section className="mt-12">
          <h2 className="text-lg font-semibold">성능 측정값</h2>
          {benchmarks.length > 0 ? (
            <div className="mt-3 space-y-3">
              {benchmarks.map((b) => (
                <BenchmarkBlock key={b.axis} bench={b} />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-fg-muted">
              이 부품의 측정값이 없습니다. 공개 벤치마크(Blender Open Data)에서 같은 이름을 찾지
              못했거나 실행이 5회 미만입니다.
            </p>
          )}
        </section>
      )}

      {related && related.items.length > 0 && (
        <section className="mt-12">
          <h2 className="text-lg font-semibold">{related.label}</h2>
          <p className="mt-1 text-xs leading-relaxed text-fg-subtle">{related.note}</p>
          {/*
            * `grid-cols-1`을 적어야 한다. 빼면 칸이 max-content로 커져서
            * `truncate`가 듣지 않고, 390px에서 긴 모델명이 화면 밖으로 30px 나갔다
            * (Tailwind의 grid-cols-N은 minmax(0, 1fr)이다).
            */}
          <ul className="mt-3 grid grid-cols-1 gap-0.5 sm:grid-cols-2">
            {related.items.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`/part/${r.category.toLowerCase()}/${r.slug}`}
                  className="-mx-2 block truncate rounded-(--radius-control) px-2 py-1.5 text-sm transition-colors hover:bg-surface-2"
                >
                  {r.modelName}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {comparable.length > 0 && (
        <section className="mt-12">
          <h2 className="text-lg font-semibold">비교해 볼 만한 부품</h2>
          <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
            같은 축을 공유하는 것끼리만 묶습니다. 아무 두 부품이나 비교하지 않습니다.
          </p>
          <ul className="mt-3 grid grid-cols-1 gap-0.5 sm:grid-cols-2">
            {comparable.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/compare/${part.slug}/vs/${c.slug}`}
                  className="-mx-2 block truncate rounded-(--radius-control) px-2 py-1.5 text-sm transition-colors hover:bg-surface-2"
                >
                  {c.modelName}하고 비교
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ODC-By 1.0은 출처 표기가 유일한 조건이다. 이 부품의 원본 링크는 여기 둔다 (§5.7) */}
      <div className="mt-12 border-t border-border pt-5 text-xs leading-relaxed text-fg-subtle">
        이 부품의 스펙은{' '}
        <a href={OPENDB_REPO} className="link">
          BuildCores OpenDB
        </a>
        에서 가져왔습니다.
        {sourceUrl && (
          <>
            {' · '}
            <a href={sourceUrl} className="link">
              원본 레코드
            </a>
          </>
        )}
        {part.manufacturerUrl && (
          <>
            {' · '}
            <a href={part.manufacturerUrl} target="_blank" rel="noreferrer noopener" className="link">
              제조사 스펙
            </a>
          </>
        )}
        {part.mpn && <span className="ml-1">· MPN {part.mpn}</span>}
      </div>
    </Container>
  );
}
