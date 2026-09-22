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
    'buildfit이 부품 조합에서 검사하는 항목과, 각 검사가 쓰는 데이터가 얼마나 채워져 있는지 공개합니다.',
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
  error: '안 맞으면 오류',
  warning: '안 맞으면 경고',
  info: '정보',
};

export default async function RulesPage() {
  let gaps: FieldGap[] = [];
  let disputed: DisputedSummary | null = null;
  let gapsFailed = false;
  try {
    const db = getDb();
    [gaps, disputed] = await Promise.all([fieldGapSummary(db), disputedSummary(db)]);
  } catch {
    // 규칙 목록은 DB 없이도 보여줄 수 있다. 숫자만 빼고 낸다 —
    // 페이지 전체를 죽이면 이 페이지의 목적(설명)이 사라진다.
    gapsFailed = true;
  }

  const ruleIds = Object.keys(RULE_SUMMARY)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <Container width="narrow" className="py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">검사 규칙과 데이터 현황</h1>
      <p className="mt-2.5 text-fg-muted">
        부품 조합에서 아래 <span className="tnum">{ruleIds.length}</span>가지를 검사합니다.
        각 검사가 쓰는 데이터가 <strong className="font-medium text-fg">얼마나 비어 있는지</strong>도
        함께 적습니다.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-fg-subtle">
        데이터가 없으면 통과시키지 않고 &lsquo;판정 불가&rsquo;로 표시합니다. 그것은 결함이 아니라
        저희가 모른다는 뜻입니다 — 없는 수치를 지어내지 않습니다.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-fg-subtle">
        각 검사에 붙은 부품 표식은 <strong className="font-medium text-fg">그 검사가 돌기 위해
        골라야 하는 부품</strong>입니다. 하나라도 비어 있으면 그 검사는 돌지 않고,
        돌지 않았다고 표시됩니다.
      </p>
      {/*
        결측만 적으면 절반만 말하는 것이다. 판정의 세 번째 상태(값은 있으나
        다투어진다)도 규모와 함께 밝힌다 — ADR-0021. 결과 화면에 「검증 중인
        값으로 판정했습니다」가 나오는데, 그게 무슨 뜻인지 알 곳이 없었다.
      */}
      <p className="mt-2 text-sm leading-relaxed text-fg-subtle">
        값이 <strong className="font-medium text-fg">어긋나는</strong> 경우도 있습니다. 같은
        제품이 원본에 여러 번 들어 있고 값이 다르거나, 오류 신고가 들어온 값입니다. 그때는
        판정을 지우지 않고 <strong className="font-medium text-fg">&lsquo;검증 중인 값으로
        판정했습니다&rsquo;</strong>라고 함께 적습니다 — 어느 쪽이 맞는지는 저희가 고르지
        않습니다. 다수결도 최신순도 근거가 아닙니다.
        {disputed && disputed.rows > 0 && (
          <>
            {' '}지금 <span className="tnum">{disputed.rows.toLocaleString()}</span>개 값,{' '}
            <span className="tnum">{disputed.parts.toLocaleString()}</span>개 부품이 그렇습니다.
          </>
        )}
      </p>

      {gapsFailed && (
        <p role="alert" className="mt-5 text-sm text-warn">
          지금은 데이터 현황을 불러올 수 없습니다. 규칙 설명만 표시합니다.
        </p>
      )}

      <ul className="mt-8 space-y-6">
        {ruleIds.map((id) => {
          const needs = (RULE_PARTS[id] ?? []) as readonly PartSlot[];
          const fields = gapsFor(id, gaps);
          const severity = severityOf(id);
          return (
            <li key={id} className="card p-4 sm:p-5">
              <div className="flex items-baseline gap-2.5">
                <span className="shrink-0 text-sm text-fg-subtle tnum">{id}</span>
                <h2 className="font-semibold">{RULE_SUMMARY[id]}</h2>
              </div>

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
                    규칙 {id}이 쓰는 데이터의 결측 현황
                  </caption>
                  <thead>
                    <tr className="text-left text-xs text-fg-subtle">
                      <th className="py-1 font-normal">쓰는 데이터</th>
                      <th className="py-1 text-right font-normal">비어 있음</th>
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
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </li>
          );
        })}
      </ul>

      <section className="mt-10 border-t border-border pt-6">
        <h2 className="font-semibold">아는 값이 있으면 알려주세요</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">
          비어 있는 값은 원본 데이터에 없는 것입니다. 부품 페이지에서 제조사 스펙과 함께
          알려주시면 그만큼 &lsquo;판정 불가&rsquo;가 줄어듭니다. 회원가입은 없습니다.
        </p>
        <Link href="/part" className="btn btn-secondary mt-3">
          부품 찾아보기
        </Link>
      </section>

      <p className="mt-8 text-xs leading-relaxed text-fg-subtle">
        규칙 번호는 건너뛴 곳이 있습니다. 데이터가 없어 아직 만들지 못한 규칙의 자리를
        비워 둔 것입니다 — 번호를 당겨 메우면 문서와 어긋납니다.
      </p>
    </Container>
  );
}
