import Link from 'next/link';
import { Container } from '@/components/SiteShell';
import { PowerCalculator } from './PowerCalculator';

/**
 * 전력·전기요금 단독 계산기 — 명세 §8, §2.1.
 *
 * 견적 없이 쓰는 입구다. 요금 계산 자체는 견적 화면과 한 벌이다
 * (`components/BillResult.tsx`, `@buildfit/compat`의 `electricity.ts`).
 */
export const metadata = {
  title: '전기요금 계산기',
  description:
    '주택용 누진제를 반영해 PC 등 기기 사용에 따른 전기요금 증가분을 계산합니다.',
};

export default function PowerCalcPage() {
  return (
    <Container width="narrow" className="py-10 sm:py-14">
      
      <h1 className="text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">전기요금 계산기</h1>
      <p className="mt-2.5 text-fg-muted">
        주택용 전기요금은 누진제가 적용되어, 같은 전력을 써도 가구 전체 사용량에 따라 추가 요금이 달라집니다.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-fg-subtle">
        부품 구성으로 소비전력을 추정하려면 <Link href="/" className="link">견적 검사</Link>를 이용해 주세요.
      </p>

      <div className="mt-8">
        <PowerCalculator />
      </div>
    </Container>
  );
}
