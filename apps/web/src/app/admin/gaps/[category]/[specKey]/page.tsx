import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SPEC_REQUIREMENTS } from '@buildfit/compat';
import { partsMissingField } from '@buildfit/db/queries';
import { Container } from '@/components/SiteShell';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export default async function GapList({
  params,
  searchParams,
}: {
  params: Promise<{ category: string; specKey: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { category, specKey } = await params;
  const { page } = await searchParams;

  const req = SPEC_REQUIREMENTS.find((r) => r.category === category && r.specKey === specKey);
  if (!req) notFound();

  const pageNo = Math.max(1, Number(page ?? '1') || 1);
  const rows = await partsMissingField(getDb(), category, specKey, {
    limit: PAGE_SIZE,
    offset: (pageNo - 1) * PAGE_SIZE,
  });

  return (
    <Container className="py-10">
      <Link href="/admin" className="link text-sm text-fg-muted">
        ← 빈 필드 목록
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">
        {category} · {req.label}
      </h1>
      <p className="mt-2 text-sm text-fg-muted">
        이 값이 없어 규칙 {req.ruleId}번이 판정 불가로 처리되는 부품이다.
        최신 부품부터 보여준다.
      </p>

      <ul className="mt-6 divide-y divide-border">
        {rows.map((p) => (
          <li key={p.id} className="py-2">
            <Link
              href={`/admin/parts/${p.id}?focus=${specKey}`}
              className="link hover:no-underline"
            >
              {p.modelName}
            </Link>
            <span className="ml-2 text-xs text-fg-subtle">
              {p.brand ?? '제조사 미상'}
              {p.releaseYear ? ` · ${p.releaseYear}` : ''}
            </span>
          </li>
        ))}
      </ul>

      {rows.length === 0 && (
        <p className="mt-6 text-sm text-fg-subtle">이 페이지에는 더 이상 없다.</p>
      )}

      <div className="mt-8 flex gap-4 text-sm">
        {pageNo > 1 && (
          <Link
            href={`/admin/gaps/${category}/${specKey}?page=${pageNo - 1}`}
            className="link"
          >
            ← 이전
          </Link>
        )}
        {rows.length === PAGE_SIZE && (
          <Link
            href={`/admin/gaps/${category}/${specKey}?page=${pageNo + 1}`}
            className="link"
          >
            다음 →
          </Link>
        )}
      </div>
    </Container>
  );
}
