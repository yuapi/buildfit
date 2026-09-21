import Link from 'next/link';
import { fieldGapSummary } from '@buildfit/db/queries';
import { openSpecReports } from '@buildfit/db/part';
import { specLabel } from '@/lib/spec-labels';
import { Container } from '@/components/SiteShell';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export const metadata = { title: '어드민 — 빈 필드 보강' };

export default async function AdminHome() {
  // 데이터를 만지기 전에 막는다. 레이아웃에서만 막으면 늦는다 (ADR-0020).
  await requireAdmin();

  const db = getDb();
  const [gaps, reports] = await Promise.all([fieldGapSummary(db), openSpecReports(db, 20)]);
  const open = gaps.filter((g) => g.missingParts > 0);
  const totalMissing = open.reduce((n, g) => n + g.missingParts, 0);

  return (
    <Container className="py-10">
      <h1 className="text-2xl font-semibold">빈 필드 보강</h1>
      <p className="mt-2 text-sm text-fg-muted">
        호환성 판정에 필요한데 아직 비어 있는 필드다. 채우면 그만큼 &ldquo;판정 불가&rdquo;가 줄어든다.
        결측이 많은 순으로 보여준다.
      </p>

      <div className="mt-6 flex gap-6 text-sm">
        <div>
          <div className="text-fg-subtle">구멍 있는 필드</div>
          <div className="text-xl font-semibold">{open.length} / {gaps.length}</div>
        </div>
        <div>
          <div className="text-fg-subtle">채워야 할 값</div>
          <div className="text-xl font-semibold">{totalMissing.toLocaleString()}개</div>
        </div>
      </div>

      {/* 사용자 신고가 가장 값싼 검증 수단이다 (§5.5). 결측 목록보다 먼저 본다. */}
      {reports.length > 0 && (
        <section className="card mt-8 border-warn-border bg-warn-bg p-4">
          <h2 className="font-medium">
            사용자 신고 <span className="text-sm font-normal text-fg-subtle">{reports.length}건</span>
          </h2>
          <p className="mt-1 text-xs text-fg-subtle">
            사용자가 실제로 마주친 오류다. 결측 목록보다 우선순위가 높다.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {reports.map((r) => (
              <li key={r.id} className="border-b border-border pb-2">
                <Link
                  href={`/admin/parts/${r.partId}?focus=${r.specKey}`}
                  className="link"
                >
                  {r.partName}
                </Link>
                <span className="ml-2 text-xs text-fg-subtle">
                  {r.category} · {specLabel(r.specKey)}
                </span>
                {r.reportedValue && (
                  <p className="mt-0.5 text-xs">
                    맞다는 값: <span className="font-medium">{r.reportedValue}</span>
                  </p>
                )}
                {r.note && <p className="mt-0.5 text-xs text-fg-subtle">{r.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <table className="mt-8 w-full text-sm">
        <thead className="border-b border-border-strong text-left">
          <tr className="text-fg-subtle">
            <th className="py-2 font-medium">카테고리</th>
            <th className="py-2 font-medium">필드</th>
            <th className="py-2 font-medium">막는 규칙</th>
            <th className="py-2 text-right font-medium">결측</th>
            <th className="py-2 text-right font-medium">비율</th>
          </tr>
        </thead>
        <tbody>
          {open.map((g) => (
            <tr key={`${g.category}.${g.specKey}`} className="border-b border-border">
              <td className="py-2">{g.category}</td>
              <td className="py-2">
                <Link
                  className="link hover:no-underline"
                  href={`/admin/gaps/${g.category}/${g.specKey}`}
                >
                  {g.label}
                </Link>
                <span className="ml-2 text-xs text-fg-subtle">{g.specKey}</span>
              </td>
              <td className="py-2 text-fg-muted">
                {g.blocksRules.map((r) => `#${r}`).join(', ')}
              </td>
              <td className="py-2 text-right tabular-nums">
                {g.missingParts.toLocaleString()} / {g.totalParts.toLocaleString()}
              </td>
              <td className="py-2 text-right tabular-nums">
                <span className={g.missingPct >= 50 ? 'font-semibold text-danger' : ''}>
                  {g.missingPct}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {open.length === 0 && (
        <p className="mt-8 text-sm text-fg-subtle">비어 있는 필수 필드가 없다.</p>
      )}
    </Container>
  );
}
