import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';

/**
 * 공통 셸 — ADR-0014.
 *
 * 헤더·푸터·컨테이너 폭을 여기서 소유한다. 페이지는 본문만 쓴다.
 * 이게 없으면 페이지마다 따로 떨어진 문서처럼 보인다.
 */

const NAV = [
  { href: '/', label: '견적 구성' },
  { href: '/part', label: '부품' },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-1 px-4 sm:gap-3">
        <Link
          href="/"
          className="mr-1 shrink-0 text-base font-semibold tracking-tight sm:mr-3"
          aria-label="buildfit 홈"
        >
          buildfit
        </Link>
        <nav aria-label="주요" className="flex items-center gap-0.5">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="btn btn-ghost">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-8 text-xs leading-relaxed text-fg-subtle">
        <p>
          <span className="font-medium text-fg-muted">buildfit</span> — PC 견적 검증 도구.
          가격 비교가 아니라 판단을 돕습니다.
        </p>
        {/* ODC-By 1.0은 출처 표기가 유일한 조건이다 (명세 §5.7) */}
        <p className="mt-2">
          부품 데이터:{' '}
          <a
            href="https://github.com/buildcores/buildcores-open-db"
            className="link"
            target="_blank"
            rel="noreferrer noopener"
          >
            BuildCores OpenDB
          </a>{' '}
          — Open Data Commons Attribution License (ODC-By) v1.0
        </p>
        <p className="mt-2">
          판정에 쓰는 값이 비어 있으면 <strong className="font-medium">판정 불가</strong>로
          표시합니다. 없는 수치를 지어내지 않습니다.
        </p>
      </div>
    </footer>
  );
}

/** 본문 컨테이너. 페이지마다 폭을 다시 정하지 않는다. */
export function Container({
  children,
  width = 'default',
  className = '',
}: {
  children: React.ReactNode;
  width?: 'default' | 'narrow';
  className?: string;
}) {
  const max = width === 'narrow' ? 'max-w-3xl' : 'max-w-6xl';
  return <div className={`mx-auto w-full ${max} px-4 ${className}`}>{children}</div>;
}
