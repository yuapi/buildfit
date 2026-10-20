'use client';

import Link from 'next/link';
import { Container } from '@/components/SiteShell';

/**
 * 예상하지 못한 오류.
 *
 * 화면마다 잡는 오류(DB 다운, 깨진 링크)는 각 페이지가 사정에 맞게 안내한다.
 * 여기까지 온 것은 우리가 예상하지 못한 경우이므로, **원인을 지어내지 않고**
 * 다시 시도할 길만 준다.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Container width="narrow" className="py-20">
      <h1 className="text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">오류가 발생했습니다</h1>
      <p className="mt-2 text-fg-muted">
        페이지를 표시하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" onClick={reset} className="btn btn-primary">
          다시 시도
        </button>
        <Link href="/" className="btn btn-secondary">
          견적 검사
        </Link>
      </div>
      <p className="mt-6 text-xs text-fg-subtle">
        저장한 견적과 공유 링크는 유지됩니다.
      </p>
    </Container>
  );
}
