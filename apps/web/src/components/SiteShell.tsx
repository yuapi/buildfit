import Link from 'next/link';
import { LogoMark } from './Icons';
import { ThemeToggle } from './ThemeToggle';

/**
 * 공통 셸 — ADR-0014, ADR-0015.
 *
 * 헤더는 **어두운 크롬 바**다. 본문과 같은 흰 배경이면 사이트에 테두리가 없고,
 * 어느 페이지에 있어도 같은 문서가 계속되는 것처럼 보인다.
 * 크롬에서만 브랜드 색을 쓴다 — 판정 영역과 한 화면에서 경쟁하지 않는다.
 */

const NAV = [
  { href: '/', label: '견적 구성' },
  { href: '/part', label: '부품' },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 bg-chrome text-chrome-fg">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-1 px-4 sm:gap-2">
        <Link
          href="/"
          className="mr-2 flex shrink-0 items-center gap-2 text-[0.95rem] font-semibold tracking-tight sm:mr-4"
          aria-label="buildfit 홈"
        >
          <span className="text-brand">
            <LogoMark />
          </span>
          buildfit
        </Link>
        <nav aria-label="주요" className="flex items-center gap-0.5">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-(--radius-control) px-2.5 py-1.5 text-sm text-chrome-muted transition-colors hover:bg-white/10 hover:text-chrome-fg sm:px-3"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
      {/* 헤더와 본문의 경계. 브랜드 색이 여기 한 줄로만 나온다 */}
      <div className="h-0.5 bg-brand" />
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 bg-chrome text-chrome-muted">
      <div className="mx-auto max-w-6xl px-4 py-10 text-xs leading-relaxed">
        <div className="flex items-center gap-2 text-sm font-semibold text-chrome-fg">
          <span className="text-brand">
            <LogoMark size={18} />
          </span>
          buildfit
        </div>
        <p className="mt-2 max-w-xl">
          PC 견적 검증 도구. 부품 조합의 호환성·소비전력을 판정합니다. 가격 비교가 아니라
          판단을 돕습니다.
        </p>
        <p className="mt-3 max-w-xl">
          판정에 쓰는 값이 비어 있으면 <strong className="font-medium text-chrome-fg">판정 불가</strong>
          로 표시합니다. 없는 수치를 지어내지 않습니다.
        </p>
        {/* ODC-By 1.0은 출처 표기가 유일한 조건이다 (명세 §5.7) */}
        <p className="mt-6 border-t border-chrome-line pt-4">
          부품 데이터:{' '}
          <a
            href="https://github.com/buildcores/buildcores-open-db"
            className="link text-chrome-fg"
            target="_blank"
            rel="noreferrer noopener"
          >
            BuildCores OpenDB
          </a>{' '}
          — Open Data Commons Attribution License (ODC-By) v1.0
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
