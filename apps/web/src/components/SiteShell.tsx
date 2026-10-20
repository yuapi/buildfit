import Link from 'next/link';
import { LogoMark } from './Icons';
import { NavLink } from './NavLink';
import { ThemeToggle } from './ThemeToggle';

/**
 * 공통 셸 — ADR-0014, ADR-0015.
 *
 * 헤더는 **칸으로 나뉜 어두운 표제란**이다 (ADR-0028). 본문과 같은 흰 배경이면 사이트에 테두리가 없고,
 * 어느 페이지에 있어도 같은 문서가 계속되는 것처럼 보인다.
 * 크롬에서만 브랜드 색을 쓴다 — 판정 영역과 한 화면에서 경쟁하지 않는다.
 */

const NAV = [
  { href: '/', label: '견적 검사' },
  { href: '/part', label: '부품' },
  { href: '/calc/power', label: '전기요금' },
  { href: '/rules', label: '검사 규칙' },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-chrome-line bg-chrome text-chrome-fg">
      {/*
        키보드로 들어오면 첫 탭이 여기다 — 메뉴를 매번 지나지 않고 본문으로 간다 (WCAG 2.4.1).
        평소에는 보이지 않다가 초점을 받으면 나타난다
      */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-40 focus:rounded-(--radius-control) focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:text-fg"
      >
        본문으로 건너뛰기
      </a>
      {/*
        표제란 — 칸마다 세로 괘선으로 나뉜다 (ADR-0028). 성적서 머리의 생김새다
      */}
      <div className="mx-auto flex h-12 max-w-6xl items-stretch px-0 sm:px-4">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 border-r border-chrome-line px-4 text-[0.95rem] font-bold tracking-tight sm:border-l"
          aria-label="buildfit 홈"
        >
          <span className="text-brand">
            <LogoMark />
          </span>
          {/*
            좁은 화면에서는 글자를 숨긴다 (이슈 #21). 로고+워드마크+메뉴 넷+테마 버튼이
            390px을 넘어 메뉴가 두 줄로 접혔다 — 「부품」이 「부/품」으로 갈렸다.
            링크 이름은 aria-label이 준다.
          */}
          <span className="hidden sm:inline font-mono text-sm tracking-tight">buildfit</span>
        </Link>
        {/*
          ★ 메뉴는 접지 않는다. 한국어는 글자 사이에서 줄이 바뀐다. 모자라면 가로로
          밀린다 — 접히는 것보다 낫다. min-w-0이 있어야 flex 안에서 줄어든다
        */}
        <nav
          aria-label="주요"
          className="flex min-w-0 items-stretch overflow-x-auto [scrollbar-width:none]"
        >
          {NAV.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              className="relative flex shrink-0 items-center whitespace-nowrap border-r border-chrome-line px-3 text-sm font-medium transition-colors after:absolute after:inset-x-0 after:bottom-[-1px] after:h-[3px] hover:bg-white/5 hover:text-chrome-fg sm:px-4"
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center border-chrome-line px-2 sm:border-x">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 bg-chrome text-chrome-muted">
      <div className="mx-auto max-w-6xl px-4">
        {/* 성적서 아래 칸처럼 셋으로 나눈다: 무엇인가 · 원칙 · 데이터 출처 */}
        <div className="grid grid-cols-1 border-chrome-line text-xs leading-relaxed sm:grid-cols-3 sm:border-x">
          <div className="border-b border-chrome-line py-6 sm:border-b-0 sm:border-r sm:px-5">
            <div className="flex items-center gap-2 text-sm font-bold text-chrome-fg">
              <span className="text-brand">
                <LogoMark size={18} />
              </span>
              <span className="font-mono">buildfit</span>
            </div>
            <p className="mt-2">PC 부품 호환성·소비전력 검사</p>
          </div>
          <div className="border-b border-chrome-line py-6 sm:border-b-0 sm:border-r sm:px-5">
            <p className="font-semibold text-chrome-fg">판정 기준</p>
            <p className="mt-2">
              판정에 필요한 데이터가 없으면 <strong className="font-medium text-chrome-fg">판정 불가</strong>로 표시합니다.{' '}
              {/* 어디가 얼마나 비었는지도 공개한다. 숨기면 판정 불가가 결함으로 읽힌다 */}
              <Link href="/rules" className="link text-chrome-fg">
                검사 규칙 및 데이터 현황
              </Link>
            </p>
          </div>
          {/* ODC-By 1.0은 출처 표기가 유일한 조건이다 (명세 §5.7) */}
          <div className="py-6 sm:px-5">
            <p className="font-semibold text-chrome-fg">데이터 출처</p>
            <p className="mt-2">
              
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
        </div>
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
