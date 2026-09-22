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
    '한국 주택용 누진 구간을 반영해, PC나 기기를 더 쓸 때 전기요금이 얼마나 오르는지 계산합니다. 가구 전체 사용량 기준입니다.',
};

export default function PowerCalcPage() {
  return (
    <Container width="narrow" className="py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">전기요금 계산기</h1>
      <p className="mt-2.5 text-fg-muted">
        <strong className="font-medium text-fg">PC 전력만 따로 곱하면 의미가 없습니다.</strong>{' '}
        주택용 전기요금은 누진 구간이 있어서, 같은 사용량이 붙어도 가구가 평소 얼마를
        쓰는지에 따라 더 내는 금액이 달라집니다.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-fg-subtle">
        부품을 골라 소비전력부터 추정하려면{' '}
        <Link href="/" className="link">
          견적 구성
        </Link>
        에서 보세요. 여기는 소비전력을 이미 알 때 씁니다.
      </p>

      <div className="mt-8">
        <PowerCalculator />
      </div>
    </Container>
  );
}
