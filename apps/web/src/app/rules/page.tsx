import Link from 'next/link';
import {
  RULE_PARTS,
  RULE_SUMMARY,
  SLOT_LABELS,
  SPEC_REQUIREMENTS,
  type PartSlot,
} from '@buildfit/compat';
import {
  disputedSummary,
  fieldGapSummary,
  type DisputedSummary,
  type FieldGap,
} from '@buildfit/db/queries';
import { Container } from '@/components/SiteShell';
import { categoryLabel } from '@/lib/categories';
import { getDb } from '@/lib/db';
import { logServerError } from '@/lib/server-log';

/**
 * 무엇을 검사하고, **무엇을 검사할 수 없는지** 공개한다.
 *
 * 이 도구의 값은 판정에 있고, 판정의 신뢰는 "모르는 것을 모른다고 하는 것"에서
 * 온다 (ADR-0009). 그렇다면 어디가 얼마나 비어 있는지도 밝혀야 한다.
 * 숨기면 사용자는 「판정 불가」를 결함으로 읽는다.
 *
 * 숫자는 **매 요청마다 실제 DB에서 센다.** 문서에 적어두면 늘 낡는다.
 * 규칙 목록·필수 필드는 `@buildfit/compat`이 정본이고 여기서 지어내지 않는다.
 */
export const dynamic = 'force-dynamic';

export const metadata = {
  title: '검사 규칙과 데이터 현황',
  description:
    '부품 조합 검사 항목과 항목별 데이터 누락 현황.',
};

/** 이 규칙이 쓰는 필수 필드들. 결측이 많은 순 */
function gapsFor(rule: number, gaps: readonly FieldGap[]): FieldGap[] {
  return gaps
    .filter((g) => g.blocksRules.includes(rule))
    .sort((a, b) => b.missingPct - a.missingPct);
}

/** 이 규칙이 오류를 낼 수 있는가. 경고까지만 내는 규칙과 구분한다 (ADR-0016 §2) */
function severityOf(rule: number): 'error' | 'warning' | 'info' {
  const found = SPEC_REQUIREMENTS.filter((r) => r.ruleId === rule).map((r) => r.severity);
  if (found.includes('error')) return 'error';
  if (found.includes('warning')) return 'warning';
  return 'info';
}

const SEVERITY_TEXT: Readonly<Record<'error' | 'warning' | 'info', string>> = {
  error: '불일치 시 오류',
  warning: '불일치 시 경고',
  info: '정보',
};

export default async function RulesPage() {
  let gaps: FieldGap[] = [];
  let disputed: DisputedSummary | null = null;
  let gapsFailed = false;
  try {
    const db = getDb();
    [gaps, disputed] = await Promise.all([fieldGapSummary(db), disputedSummary(db)]);
  } catch (err) {
    logServerError('/rules', err);
    // 규칙 목록은 DB 없이도 보여줄 수 있다. 숫자만 빼고 낸다 —
    // 페이지 전체를 죽이면 이 페이지의 목적(설명)이 사라진다.
    gapsFailed = true;
  }

  const ruleIds = Object.keys(RULE_SUMMARY)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <Container width="narrow" className="py-10 sm:py-14">
      
      <h1 className="text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">검사 규칙과 데이터 현황</h1>
      <p className="mt-2.5 text-fg-muted">
        부품 조합에서 <span className="tnum">{ruleIds.length}</span>개 항목을 검사합니다. 항목별로 판정에 쓰는 데이터의 누락 비율을 함께 표시합니다.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-fg-subtle">
        판정에 필요한 데이터가 없으면 통과로 처리하지 않고 &lsquo;판정 불가&rsquo;로 표시합니다.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-fg-subtle">
        항목마다 표시된 부품을 모두 선택해야 해당 항목을 검사합니다.
      </p>
      {/*
        결측만 적으면 절반만 말하는 것이다. 판정의 세 번째 상태(값은 있으나
        다투어진다)도 규모와 함께 밝힌다 — ADR-0021. 결과 화면에 「검증 중인
        값으로 판정했습니다」가 나오는데, 그게 무슨 뜻인지 알 곳이 없었다.
      */}
      <p className="mt-2 text-sm leading-relaxed text-fg-subtle">
        중복 등록된 제품의 값이 서로 다르거나, 출시 연도가 소켓 출시보다 앞서거나, 메모리 모듈 수·용량이 맞지 않거나, 오류 신고가 접수된 값은 <strong className="font-medium text-fg">&lsquo;검증 중&rsquo;</strong>으로 표시하고 판정 결과에 함께 안내합니다.
        {disputed && disputed.rows > 0 && (
          <>
            {' '}현재 <span className="tnum">{disputed.rows.toLocaleString()}</span>개 값 · <span className="tnum">{disputed.parts.toLocaleString()}</span>개 부품.
          </>
        )}
      </p>

      {gapsFailed && (
        <p role="alert" className="mt-5 text-sm text-warn">
          데이터 현황을 불러오지 못했습니다. 규칙 목록만 표시합니다.
        </p>
      )}

      {/* 규칙 20개는 카드 20장이 아니라 한 장의 표다. 왼쪽 칸이 규칙 번호다 (ADR-0028) */}
      <ul className="card mt-8 divide-y divide-border">
        {ruleIds.map((id) => {
          const needs = (RULE_PARTS[id] ?? []) as readonly PartSlot[];
          const fields = gapsFor(id, gaps);
          const severity = severityOf(id);
          return (
            <li key={id} className="grid grid-cols-[3.75rem_minmax(0,1fr)] sm:grid-cols-[4.5rem_minmax(0,1fr)]">
              <span className="border-r border-border bg-surface-2 px-2 pt-4 text-center font-mono text-xs font-semibold text-fg-muted tnum sm:pt-5">
                R-{String(id).padStart(2, '0')}
              </span>
              <div className="min-w-0 p-4 sm:p-5">
              <h2 className="font-bold">{RULE_SUMMARY[id]}</h2>

              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="chip">{SEVERITY_TEXT[severity]}</span>
                {needs.map((slot) => (
                  <span key={slot} className="chip">
                    {SLOT_LABELS[slot]}
                  </span>
                ))}
              </p>
              {fields.length > 0 && (
                <table className="mt-3 w-full text-sm">
                  <caption className="sr-only">
                    규칙 {id}번이 쓰는 데이터의 결측 현황
                  </caption>
                  <thead>
                    <tr className="text-left text-xs text-fg-subtle">
                      <th className="py-1 font-normal">사용 데이터</th>
                      <th className="py-1 text-right font-normal">누락</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((f) => (
                      <tr key={`${f.category}-${f.specKey}`} className="border-t border-border">
                        <th scope="row" className="py-1.5 text-left font-normal">
                          {categoryLabel(f.category)}의 {f.label}
                        </th>
                        <td className="py-1.5 text-right tnum">
                          {/*
                            * 색을 쓰지 않는다. 판정 색과 한 화면에서 경쟁하지 않게 (ADR-0015).
                            * 비율과 건수를 함께 적는다 — 84.5%만으로는 규모를 모른다.
                            */}
                          <span className={f.missingPct >= 50 ? 'font-medium' : ''}>
                            {f.missingPct}%
                          </span>
                          <span className="ml-1.5 text-xs text-fg-subtle">
                            {f.missingParts.toLocaleString()}/{f.totalParts.toLocaleString()}
                          </span>
                          {/* 빈 정도를 막대로도 — 무채색이다. 판정이 아니다 */}
                          <span aria-hidden className="mt-1 ml-auto block h-[3px] w-24 bg-surface-2">
                            <span
                              className="block h-full bg-fg-muted"
                              style={{ width: `${Math.max(f.missingPct, f.missingParts > 0 ? 2 : 0)}%` }}
                            />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              </div>
            </li>
          );
        })}
      </ul>

      <section className="mt-10 border-t border-border pt-6">
        <h2 className="font-semibold">누락 데이터 제보</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">
          부품 상세 페이지에서 누락된 값을 제보할 수 있습니다. 제조사 스펙 URL을 함께 입력하면 확인 후 반영합니다.
        </p>
        <Link href="/part" className="btn btn-secondary mt-3">
          부품 목록
        </Link>
      </section>

      <p className="mt-8 text-xs leading-relaxed text-fg-subtle">
        빠진 규칙 번호는 데이터 부족으로 보류된 규칙입니다.
      </p>
    </Container>
  );
}
