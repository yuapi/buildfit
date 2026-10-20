import Link from 'next/link';
import { Container } from '@/components/SiteShell';

export const metadata = { title: '페이지를 찾을 수 없습니다' };

export default function NotFound() {
  return (
    <Container width="narrow" className="py-20">
      <p className="text-sm font-medium text-fg-subtle tnum">404</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">
        페이지를 찾을 수 없습니다
      </h1>
      <p className="mt-2 text-fg-muted">
        주소가 변경되었거나 삭제된 페이지입니다.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/" className="btn btn-primary">
          견적 검사
        </Link>
        <Link href="/part" className="btn btn-secondary">
          부품 목록
        </Link>
      </div>
    </Container>
  );
}
