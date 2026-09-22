import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SPEC_REQUIREMENTS } from '@buildfit/compat';
import { gapCounts, partsMissingField } from '@buildfit/db/queries';
import { Container } from '@/components/SiteShell';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { BulkRow } from './BulkRow';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export default async function GapList({
  params,
  searchParams,
}: {
  params: Promise<{ category: string; specKey: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  // 데이터를 만지기 전에 막는다. 레이아웃에서만 막으면 늦는다 (ADR-0020).
  await requireAdmin();

  const { category, specKey } = await params;
  const { page } = await searchParams;

  const req = SPEC_REQUIREMENTS.find((r) => r.category === category && r.specKey === specKey);
  if (!req) notFound();

  const pageNo = Math.max(1, Number(page ?? '1') || 1);
  const [rows, counts] = await Promise.all([
    partsMissingField(getDb(), category, specKey, {
      limit: PAGE_SIZE,
      offset: (pageNo - 1) * PAGE_SIZE,
    }),
    gapCounts(getDb(), category, specKey),
  ]);

  return (
    <Container className="py-10">
      <Link href="/admin" className="link text-sm text-fg-muted">
        ← 빈 필드 목록
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">
        {category} · {req.label}
      </h1>
      <p className="mt-2 text-sm text-fg-muted">
        이 값이 없어 규칙 {req.ruleId}번이 판정 불가로 처리되는 부품{' '}
        <strong className="font-medium">{counts.missing.toLocaleString()}건</strong>이다.
      </p>
      {/*
        보강에서 가장 오래 걸리는 단계는 출처를 찾는 것이다. 주소가 있는 것을
        먼저 준다 — 케이스 지원 파워 폼팩터는 결측 3,185건 중 3,155건이 출시연도를
        모르므로, 전에 쓰던 "최신순"은 사실상 이름순이었다 (이슈 #3).
      */}
      <p className="mt-1 text-sm">
        이 중 <strong className="font-medium">{counts.withSource.toLocaleString()}건</strong>은
        제조사 스펙 주소가 있어 바로 채울 수 있다. 그것부터 보여준다.
        {counts.missing > counts.withSource && (
          <span className="text-fg-subtle">
            {' '}나머지 {(counts.missing - counts.withSource).toLocaleString()}건은 출처를 직접
            찾아야 한다.
          </span>
        )}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
        여기서 바로 채운다. 채운 줄은 <strong className="font-medium">사라지지 않고</strong>{' '}
        「저장됨」으로 남는다 — 사라지면 아래 줄이 위로 밀려 커서 아래에서 줄이 바뀐다.
        목록을 새로 받으려면 새로고침한다.
      </p>

      {/* 줄마다 상세 화면을 열고 돌아오는 왕복이 작업량의 대부분이었다 (이슈 #3) */}
      <div className="mt-6 divide-y divide-border">
        {rows.map((p) => (
          <BulkRow key={p.id} req={req} part={p} />
        ))}
      </div>

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
