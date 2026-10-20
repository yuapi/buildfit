'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * 헤더 메뉴 한 칸. 지금 있는 곳이면 표시한다 — 표시가 없으면 어느 화면인지
 * 제목을 읽어야 안다. 표시는 브랜드 색 막대다 (크롬이므로 허용, ADR-0015).
 */
export function NavLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: React.ReactNode;
}) {
  const path = usePathname() ?? '/';
  const here = href === '/' ? path === '/' || path.startsWith('/build') : path.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={here ? 'page' : undefined}
      className={`${className} ${here ? 'text-chrome-fg after:bg-brand' : 'text-chrome-muted after:bg-transparent'}`}
    >
      {children}
    </Link>
  );
}
