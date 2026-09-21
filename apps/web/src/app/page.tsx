import { Container } from '@/components/SiteShell';
import { BuildTool } from './BuildTool';

export const metadata = {
  // 첫 화면은 브랜드가 제목이다. 템플릿을 거치면 「— buildfit」이 두 번 붙는다.
  title: { absolute: 'buildfit — PC 견적 검증' },
  description:
    'PC 부품 조합의 호환성과 소비전력을 판정합니다. 가격 비교가 아니라 판단을 돕는 도구입니다.',
};

export default function Home() {
  return (
    <Container className="py-8 sm:py-10">
      {/*
       * 문구는 광고가 아니라 설명이다. 도구의 첫 화면에서 말장난을 하면
       * 도구 자체가 덜 미더워 보인다. 무엇을 하는지만 적는다.
       */}
      <section className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">조립 전 호환성 검증</h1>
        <p className="mt-2.5 text-fg-muted">
          부품을 고르면 서로 맞물리는지, 파워 용량이 충분한지 판정합니다. 가격 비교가 아니라{' '}
          <strong className="font-medium text-fg">판단을 돕는 도구</strong>입니다.
        </p>
        {/* 판정 불가를 결함으로 오해하지 않게 한 줄로 못 박는다 */}
        <p className="mt-2 text-sm text-fg-subtle">
          데이터가 없으면 통과시키지 않고 &lsquo;판정 불가&rsquo;로 표시합니다. 회원가입은
          없습니다.
        </p>
      </section>

      <div className="mt-7">
        <BuildTool />
      </div>
    </Container>
  );
}
