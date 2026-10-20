'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * 테마 전환 — ADR-0014.
 *
 * 기본은 시스템 설정이고, 사용자가 고르면 `<html data-theme>`로 덮는다.
 * 선택은 `localStorage`에 남긴다 (add-only, ADR-0005).
 *
 * 첫 페인트 전 적용은 `layout.tsx`의 인라인 스크립트가 한다. 여기서 하면
 * 밝은 화면이 한 번 번쩍인다.
 */

export type Theme = 'system' | 'light' | 'dark';

export const THEME_KEY = 'theme';

const ORDER: readonly Theme[] = ['system', 'light', 'dark'];

const LABEL: Record<Theme, string> = {
  system: '시스템 설정',
  light: '밝게',
  dark: '어둡게',
};

function read(): Theme {
  if (typeof document === 'undefined') return 'system';
  const attr = document.documentElement.dataset['theme'];
  return attr === 'light' || attr === 'dark' ? attr : 'system';
}

/** `data-theme` 변경을 구독한다. 상태를 두 벌로 두지 않고 DOM을 진실로 삼는다. */
function subscribe(onChange: () => void): () => void {
  if (typeof document === 'undefined') return () => {};
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => mo.disconnect();
}

function apply(next: Theme): void {
  const root = document.documentElement;
  if (next === 'system') delete root.dataset['theme'];
  else root.dataset['theme'] = next;
  try {
    if (next === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, next);
  } catch {
    // 시크릿 모드·스토리지 차단. 이번 세션에만 적용되고 앱은 그대로 동작한다 (§8A.4)
  }
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => 'system' as Theme);

  const cycle = useCallback(() => {
    const at = ORDER.indexOf(theme);
    apply(ORDER[(at + 1) % ORDER.length]!);
  }, [theme]);

  return (
    <button
      type="button"
      onClick={cycle}
      // 헤더의 어두운 크롬 위에 놓인다. 본문 색 토큰을 쓰면 안 보인다
      className="flex items-center gap-1.5 rounded-(--radius-control) px-2.5 py-1.5 text-xs text-chrome-muted transition-colors hover:bg-white/10 hover:text-chrome-fg"
      // 아이콘만으로는 현재 상태를 읽을 수 없다. 이름에 상태를 담는다
      aria-label={`화면 테마: ${LABEL[theme]}. 눌러서 변경`}
      title={`화면 테마: ${LABEL[theme]}`}
    >
      <ThemeIcon theme={theme} />
      <span className="hidden sm:inline">{LABEL[theme]}</span>
    </button>
  );
}

function ThemeIcon({ theme }: { theme: Theme }) {
  const common = {
    width: 15,
    height: 15,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (theme === 'dark') {
    return (
      <svg {...common}>
        <path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1Z" />
      </svg>
    );
  }
  if (theme === 'light') {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="3.1" />
        <path d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1M12.9 12.9l-1.1-1.1M4.2 4.2 3.1 3.1" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="1.5" y="2.5" width="13" height="9" rx="1.5" />
      <path d="M5.5 14h5" />
    </svg>
  );
}
