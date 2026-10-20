import { RULE_SUMMARY } from '@buildfit/compat';
import { Container } from '@/components/SiteShell';
import { CATEGORY_LABELS } from '@/lib/categories';
import { BuildTool } from './BuildTool';

export const metadata = {
  // 첫 화면은 브랜드가 제목이다. 템플릿을 거치면 「— buildfit」이 두 번 붙는다.
  title: { absolute: 'buildfit — PC 견적 검증' },
  description:
    'PC 부품 조합의 호환성과 소비전력을 판정합니다. 가격 비교가 아니라 판단을 돕는 도구입니다.',
};

/** 표제 칸 오른쪽의 사양. 지어낸 홍보 수치가 아니라 이 도구가 하는 일의 범위다 */
const SPEC: readonly (readonly [string, React.ReactNode])[] = [
  ['검사 항목', <><span className="stat text-lg">{Object.keys(RULE_SUMMARY).length}</span>개</>],
  ['다루는 부품', <><span className="stat text-lg">{Object.keys(CATEGORY_LABELS).length}</span>종</>],
  ['값이 없으면', '판정 불가'],
  ['회원가입', '없음'],
];

/** 좁은 화면은 2×2, 넓은 화면은 세로 한 줄 — 칸마다 그을 괘선 */
const SPEC_EDGES = [
  'border-b border-r lg:border-r-0',
  'border-b',
  'border-r lg:border-b lg:border-r-0',
  '',
] as const;

export default function Home() {
  return (
    <Container className="py-6 sm:py-8">
      {/*
       * 표제 칸 — 성적서의 머리 (ADR-0028).
       * 문구는 광고가 아니라 설명이다. 무엇을 하는지만 적는다.
       */}
      <section className="card sheet-grid grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="px-5 py-7 sm:px-8 sm:py-9">
          <p className="eyebrow">PC Build Inspection</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.035em] sm:text-5xl">
            조립 전 호환성 검증
          </h1>
          <p className="mt-4 max-w-xl text-fg-muted">
            부품을 고르면 서로 맞물리는지, 파워 용량이 충분한지 판정합니다. 가격 비교가 아니라{' '}
            <strong className="font-semibold text-fg">판단을 돕는 도구</strong>입니다.
          </p>
        </div>
        {/* 판정 불가를 결함으로 오해하지 않게 사양 칸에 못 박는다 */}
        <dl className="grid grid-cols-2 border-t border-border bg-surface text-sm lg:grid-cols-1 lg:border-l lg:border-t-0">
          {SPEC.map(([k, v], i) => (
            <div
              key={k}
              className={`flex flex-col justify-center gap-0.5 border-border px-5 py-3 ${SPEC_EDGES[i]}`}
            >
              <dt className="text-xs text-fg-subtle">{k}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-6">
        <BuildTool />
      </div>
    </Container>
  );
}
