import Link from 'next/link';
import { fieldGapSummary } from '@buildfit/db/queries';
import { openSpecReports } from '@buildfit/db/part';
import { specLabel } from '@/lib/spec-labels';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const metadata = { title: '어드민 — 빈 필드 보강' };

export default async function AdminHome() {
  const db = getDb();
  const [gaps, reports] = await Promise.all([fieldGapSummary(db), openSpecReports(db, 20)]);
  const open = gaps.filter((g) => g.missingParts > 0);
  const totalMissing = open.reduce((n, g) => n + g.missingParts, 0);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold">빈 필드 보강</h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        호환성 판정에 필요한데 아직 비어 있는 필드다. 채우면 그만큼 &ldquo;판정 불가&rdquo;가 줄어든다.
        결측이 많은 순으로 보여준다.
      </p>

      <div className="mt-6 flex gap-6 text-sm">
        <div>
          <div className="text-neutral-500">구멍 있는 필드</div>
          <div className="text-xl font-semibold">{open.length} / {gaps.length}</div>
        </div>
        <div>
          <div className="text-neutral-500">채워야 할 값</div>
          <div className="text-xl font-semibold">{totalMissing.toLocaleString()}개</div>
        </div>
      </div>

      {/* 사용자 신고가 가장 값싼 검증 수단이다 (§5.5). 결측 목록보다 먼저 본다. */}
      {reports.length > 0 && (
        <section className="mt-8 rounded border border-amber-400 p-4 dark:border-amber-600">
          <h2 className="font-medium">
            사용자 신고 <span className="text-sm font-normal text-neutral-500">{reports.length}건</span>
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            사용자가 실제로 마주친 오류다. 결측 목록보다 우선순위가 높다.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {reports.map((r) => (
              <li key={r.id} className="border-b border-neutral-200 pb-2 dark:border-neutral-800">
                <Link
                  href={`/admin/parts/${r.partId}?focus=${r.specKey}`}
                  className="underline underline-offset-2"
                >
                  {r.partName}
                </Link>
                <span className="ml-2 text-xs text-neutral-500">
                  {r.category} · {specLabel(r.specKey)}
                </span>
                {r.reportedValue && (
                  <p className="mt-0.5 text-xs">
                    맞다는 값: <span className="font-medium">{r.reportedValue}</span>
                  </p>
                )}
                {r.note && <p className="mt-0.5 text-xs text-neutral-500">{r.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <table className="mt-8 w-full text-sm">
        <thead className="border-b border-neutral-300 text-left dark:border-neutral-700">
          <tr className="text-neutral-500">
            <th className="py-2 font-medium">카테고리</th>
            <th className="py-2 font-medium">필드</th>
            <th className="py-2 font-medium">막는 규칙</th>
            <th className="py-2 text-right font-medium">결측</th>
            <th className="py-2 text-right font-medium">비율</th>
          </tr>
        </thead>
        <tbody>
          {open.map((g) => (
            <tr key={`${g.category}.${g.specKey}`} className="border-b border-neutral-200 dark:border-neutral-800">
              <td className="py-2">{g.category}</td>
              <td className="py-2">
                <Link
                  className="underline underline-offset-2 hover:no-underline"
                  href={`/admin/gaps/${g.category}/${g.specKey}`}
                >
                  {g.label}
                </Link>
                <span className="ml-2 text-xs text-neutral-500">{g.specKey}</span>
              </td>
              <td className="py-2 text-neutral-600 dark:text-neutral-400">
                {g.blocksRules.map((r) => `#${r}`).join(', ')}
              </td>
              <td className="py-2 text-right tabular-nums">
                {g.missingParts.toLocaleString()} / {g.totalParts.toLocaleString()}
              </td>
              <td className="py-2 text-right tabular-nums">
                <span className={g.missingPct >= 50 ? 'font-semibold text-red-600 dark:text-red-400' : ''}>
                  {g.missingPct}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {open.length === 0 && (
        <p className="mt-8 text-sm text-neutral-500">비어 있는 필수 필드가 없다.</p>
      )}
    </main>
  );
}
