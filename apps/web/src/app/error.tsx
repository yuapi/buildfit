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
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">문제가 생겼습니다</h1>
      <p className="mt-2 text-fg-muted">
        이 화면을 그리는 중에 오류가 났습니다. 다시 시도해 보시고, 계속 같으면 잠시 후에 열어
        주세요.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" onClick={reset} className="btn btn-primary">
          다시 시도
        </button>
        <Link href="/" className="btn btn-secondary">
          견적 구성으로
        </Link>
      </div>
      <p className="mt-6 text-xs text-fg-subtle">
        저장해 둔 견적과 공유 링크는 그대로 있습니다. 견적은 링크 안에 담겨 있습니다.
      </p>
    </Container>
  );
}
