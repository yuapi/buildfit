import Link from 'next/link';
import { Container } from '@/components/SiteShell';

export const metadata = { title: '페이지를 찾을 수 없습니다' };

export default function NotFound() {
  return (
    <Container width="narrow" className="py-20">
      <p className="text-sm font-medium text-fg-subtle tnum">404</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
        이 주소에는 아무것도 없습니다
      </h1>
      <p className="mt-2 text-fg-muted">
        주소가 바뀌었거나, 부품이 목록에서 빠졌을 수 있습니다. 비교 페이지는 같은 카테고리의
        서로 다른 두 부품일 때만 열립니다.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/" className="btn btn-primary">
          견적 구성으로
        </Link>
        <Link href="/part" className="btn btn-secondary">
          부품 목록 보기
        </Link>
      </div>
    </Container>
  );
}
