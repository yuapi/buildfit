import { Container } from '@/components/SiteShell';
import { BuildTool } from './BuildTool';

export const metadata = {
  title: 'buildfit — PC 견적 검증',
  description:
    'PC 부품 조합의 호환성과 소비전력을 판정합니다. 가격 비교가 아니라 판단을 돕는 도구입니다.',
};

export default function Home() {
  return (
    <Container className="py-8 sm:py-10">
      <section className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">이 조합, 문제 없나?</h1>
        <p className="mt-2.5 text-fg-muted">
          부품을 고르면 호환성·소비전력·필요 파워를 판정합니다. 가격 비교가 아니라{' '}
          <strong className="font-medium text-fg">판단을 돕는 도구</strong>입니다.
        </p>
        {/* 이 도구의 성격을 한 줄로 못 박는다. 판정 불가를 결함으로 오해하지 않게 한다 */}
        <p className="mt-2 text-sm text-fg-subtle">
          값이 없으면 통과시키지 않고 &lsquo;판정 불가&rsquo;로 표시합니다. 회원가입은 없습니다.
        </p>
      </section>

      <div className="mt-7">
        <BuildTool />
      </div>
    </Container>
  );
}
