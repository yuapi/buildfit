import Link from 'next/link';
import { rejectReportAction } from './actions';
import {
  conflictingSpecs,
  fieldGapSummary,
  implausibleReleaseYears,
  inconsistentRamKits,
} from '@buildfit/db/queries';
import { openSpecReports } from '@buildfit/db/part';
import { specLabel, specValueText } from '@/lib/spec-labels';
import { Container } from '@/components/SiteShell';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { deployStatus } from '@/lib/deploy-status';

export const dynamic = 'force-dynamic';

export const metadata = { title: '어드민 — 누락 데이터 보강' };

export default async function AdminHome() {
  // 데이터를 만지기 전에 막는다. 레이아웃에서만 막으면 늦는다 (ADR-0020).
  await requireAdmin();

  const db = getDb();
  const [gaps, reports, conflicts, earlyYears, badKits] = await Promise.all([
    fieldGapSummary(db),
    openSpecReports(db, 20),
    conflictingSpecs(db, 100),
    implausibleReleaseYears(db),
    inconsistentRamKits(db),
  ]);
  const open = gaps.filter((g) => g.missingParts > 0);
  const totalMissing = open.reduce((n, g) => n + g.missingParts, 0);
  // 지금 도는 배포 (T-22). 개발 환경이면 없다
  const deployed = deployStatus(process.cwd());

  return (
    <Container className="py-10">
      <h1 className="text-3xl font-extrabold tracking-[-0.03em]">누락 데이터 보강</h1>
      <p className="mt-2 text-sm text-fg-muted">
        호환성 판정에 필요한 누락 필드입니다. 누락이 많은 순으로 표시합니다.
      </p>

      {deployed && (
        <p className="mt-3 text-xs text-fg-subtle">
          배포 버전 <span className="font-medium text-fg">{deployed.label}</span> ({deployed.sha.slice(0, 7)})
          {deployed.failedSha && (
            <span className="ml-2 text-danger">
              최근 자동 배포 실패: {deployed.failedSha.slice(0, 7)} (서버 로그: journalctl -u buildfit-deploy)
            </span>
          )}
        </p>
      )}

      <div className="mt-6 flex gap-6 text-sm">
        <div>
          <div className="text-fg-subtle">누락 필드</div>
          <div className="text-xl font-semibold">{open.length} / {gaps.length}</div>
        </div>
        <div>
          <div className="text-fg-subtle">누락 값</div>
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
            사용자가 신고한 오류입니다. 누락 목록보다 먼저 처리합니다.
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
                    신고 값: <span className="font-medium">{r.reportedValue}</span>
                  </p>
                )}
                {r.note && <p className="mt-0.5 text-xs text-fg-subtle">{r.note}</p>}
                {/* 값을 고쳐 저장하면 신고가 함께 닫힌다. 신고가 틀렸을 때만 거절한다 (T-18) */}
                <form action={rejectReportAction} className="mt-1">
                  <input type="hidden" name="reportId" value={r.id} />
                  <button type="submit" className="btn btn-ghost px-2 py-0.5 text-xs">
                    거절
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/*
        같은 제품인데 값이 다르면 **하나는 틀렸다.** 정답을 몰라도 얻는 신호다 —
        이 프로젝트에서 검증 근거를 구하기가 가장 어려운데(외부 도메인이 막혀 있다)
        이것은 데이터 안에서 나온다. 빈 필드보다 훨씬 작고 훨씬 정확한 목록이다.
      */}
      {conflicts.length > 0 && (
        <section className="mt-8">
          <h2 className="font-medium">
            값 불일치{' '}
            <span className="text-sm font-normal text-fg-subtle">{conflicts.length}건</span>
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
            중복 등록된 제품의 값이 서로 다릅니다. 출처를 확인해 저장하면 「검증 중」 표시가 해제됩니다.
          </p>
          <ul className="mt-3 space-y-3">
            {conflicts.map((c) => (
              <li
                key={`${c.canonicalId}.${c.specKey}`}
                className="card border-warn-border p-3 text-sm"
              >
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{specLabel(c.specKey)}</span>
                  <span className="text-xs text-fg-subtle">{c.specKey}</span>
                  {c.affectsRules.length > 0 && (
                    <span className="text-xs text-fg-muted">
                      규칙 {c.affectsRules.map((r) => `#${r}`).join(', ')}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-xs text-fg-muted">
                  {c.category} · {c.brand ?? '제조사 미상'} {c.modelName}
                </div>
                {/* 나란히 보여주는 것이 이 목록의 전부다. "의심된다"만 적으면 처음부터 다시 찾아야 한다 */}
                <ul className="mt-2 flex flex-wrap gap-2">
                  {c.values.map((v) => (
                    <li key={JSON.stringify(v.value)} className="chip tnum">
                      {specValueText(v.value, v.unit)}
                      {/*
                        몇 건이 그 값을 들고 있는지 적는다 — "true 2건 vs false 1건"과
                        "1건 vs 1건"은 다른 상황이다. 다수결로 고르라는 뜻은 아니다.
                      */}
                      {v.partIds.length > 1 && (
                        <span className="ml-1.5 text-fg-subtle">{v.partIds.length}건</span>
                      )}
                      <span className="ml-1.5">
                        {v.partIds.map((id, i) => (
                          <Link
                            key={id}
                            href={`/admin/parts/${id}?focus=${c.specKey}`}
                            className="link ml-1"
                            aria-label={`값 ${specValueText(v.value, v.unit)} — ${i + 1}번째 레코드 보강`}
                          >
                            {v.partIds.length > 1 ? i + 1 : '보강'}
                          </Link>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/*
        소켓이 나오기 전 연도를 단 레코드 (이슈 #18). 위 목록과 같은 종류의 신호다 —
        정답을 몰라도 데이터 안에서 나온다. 규칙 12가 이 값으로 헛경고를 내거나
        경고를 놓친다.
      */}
      {earlyYears.length > 0 && (
        <section className="mt-8">
          <h2 className="font-medium">
            출시 연도 오류{' '}
            <span className="text-sm font-normal text-fg-subtle">{earlyYears.length}건</span>
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
            출시 연도가 같은 소켓의 다른 부품보다 크게 앞섭니다. 출처를 확인해 저장하면 「검증 중」 표시가 해제됩니다.
          </p>
          <ul className="mt-3 space-y-2">
            {earlyYears.map((y) => (
              <li key={y.partId} className="card border-warn-border p-3 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <Link href={`/admin/parts/${y.partId}?focus=release_year`} className="link">
                    {y.modelName}
                  </Link>
                  <span className="text-xs text-fg-subtle">{y.category} · 규칙 #12</span>
                </div>
                <p className="mt-0.5 text-xs text-fg-muted tnum">
                  {y.socket} · 원본 {y.year}년 · 이 소켓의 다음 연도 {y.nextYear}년 (연도 기록 {y.socketCount}건 중 {y.leadCount}건이 앞섬)
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/*
        모듈 수 × 모듈 용량 ≠ 총 용량 (이슈 #20). 경계값 없는 신호다 — 산술이 맞거나
        안 맞거나. 규칙 3(오류 등급)과 16이 이 값을 읽는다.
      */}
      {badKits.length > 0 && (
        <section className="mt-8">
          <h2 className="font-medium">
            메모리 구성 불일치{' '}
            <span className="text-sm font-normal text-fg-subtle">{badKits.length}건</span>
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
            모듈 수 × 모듈 용량이 총 용량 또는 제품명의 구성과 다릅니다. 출처를 확인해 수정하면 표시가 해제됩니다.
          </p>
          <ul className="mt-3 space-y-2">
            {badKits.map((k) => (
              <li key={k.partId} className="card border-warn-border p-3 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <Link href={`/admin/parts/${k.partId}?focus=capacity_gb`} className="link">
                    {k.modelName}
                  </Link>
                  <span className="text-xs text-fg-subtle">RAM · 규칙 #3, #16</span>
                </div>
                <p className="mt-0.5 text-xs text-fg-muted tnum">
                  값: {k.moduleCount ?? '?'} × {k.moduleCapacityGb ?? '?'}GB = 총 {k.capacityGb ?? '?'}GB
                  {k.nameCount !== null && k.nameModuleGb !== null && (
                    <> · 이름: {k.nameCount} × {k.nameModuleGb}GB</>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mt-10 font-medium">누락 필드</h2>
      <table className="mt-3 w-full text-sm">
        <thead className="border-b border-border-strong text-left">
          <tr className="text-fg-subtle">
            <th className="py-2 font-medium">카테고리</th>
            <th className="py-2 font-medium">필드</th>
            <th className="py-2 font-medium">영향 규칙</th>
            <th className="py-2 text-right font-medium">누락</th>
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
        <p className="mt-8 text-sm text-fg-subtle">누락된 필수 필드가 없습니다.</p>
      )}
    </Container>
  );
}
