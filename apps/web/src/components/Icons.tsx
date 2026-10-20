/**
 * 부품 아이콘 — ADR-0015.
 *
 * OpenDB에 제품 사진이 없다 (레포의 `assets`는 로고 두 장뿐). PC 부품 사이트가
 * 썸네일로 얻는 **시각적 닻**을 아이콘으로 대신한다. 글자만 늘어놓으면
 * 목록에서 무엇이 무엇인지 눈으로 훑기가 어렵다.
 *
 * 부품의 실제 생김새를 본뜬다. 소켓은 격자, 메모리는 기판, 케이스는 타워.
 * 추상 기호를 쓰면 아이콘을 하나씩 외워야 한다.
 */

const BASE = {
  width: 18,
  height: 18,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.3,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
};

function Cpu() {
  return (
    <svg {...BASE}>
      <rect x="5.5" y="5.5" width="9" height="9" rx="1" />
      <rect x="8.25" y="8.25" width="3.5" height="3.5" rx="0.5" />
      <path d="M8 5.5V3.5M12 5.5V3.5M8 16.5v-2M12 16.5v-2M5.5 8H3.5M5.5 12H3.5M16.5 8h-2M16.5 12h-2" />
    </svg>
  );
}

function Motherboard() {
  return (
    <svg {...BASE}>
      <rect x="3" y="3" width="14" height="14" rx="1.5" />
      <rect x="5.5" y="5.5" width="4" height="4" rx="0.5" />
      <path d="M12 5.5h3M12 7.5h3M5.5 12h9M5.5 14.5h6" />
    </svg>
  );
}

function Ram() {
  return (
    <svg {...BASE}>
      <path d="M2.5 6.5h15v7h-3l-1 1.5h-7l-1-1.5h-3z" />
      <path d="M6 8.5v3M8.5 8.5v3M11.5 8.5v3M14 8.5v3" />
    </svg>
  );
}

function Gpu() {
  return (
    <svg {...BASE}>
      <rect x="2.5" y="5.5" width="15" height="8" rx="1" />
      <circle cx="7" cy="9.5" r="2.2" />
      <circle cx="13" cy="9.5" r="2.2" />
      <path d="M5.5 13.5v2M14.5 13.5v2" />
    </svg>
  );
}

function PcCase() {
  return (
    <svg {...BASE}>
      <rect x="5" y="2.5" width="10" height="15" rx="1.5" />
      <path d="M7.5 5.5h5" />
      <circle cx="10" cy="11" r="2.8" />
    </svg>
  );
}

function Psu() {
  return (
    <svg {...BASE}>
      <rect x="2.5" y="5.5" width="15" height="9" rx="1.5" />
      <circle cx="7" cy="10" r="2.5" />
      <path d="M12 8.5h3.5M12 11.5h3.5" />
    </svg>
  );
}

function Cooler() {
  return (
    <svg {...BASE}>
      <rect x="3.5" y="3.5" width="13" height="13" rx="1.5" />
      <circle cx="10" cy="10" r="3.2" />
      <path d="M10 6.8V4M10 16v-2.8M6.8 10H4M16 10h-2.8" />
    </svg>
  );
}

function Storage() {
  return (
    <svg {...BASE}>
      <rect x="2.5" y="6.5" width="15" height="7" rx="1.5" />
      <circle cx="6" cy="10" r="1" />
      <path d="M9 10h6" />
    </svg>
  );
}

const BY_CATEGORY: Record<string, () => React.ReactElement> = {
  CPU: Cpu,
  Motherboard: Motherboard,
  RAM: Ram,
  GPU: Gpu,
  PCCase: PcCase,
  PSU: Psu,
  CPUCooler: Cooler,
  Storage: Storage,
};

/** 카테고리 아이콘. 모르는 카테고리면 아무것도 그리지 않는다. */
export function PartIcon({ category, className }: { category: string; className?: string }) {
  const Glyph = BY_CATEGORY[category];
  if (!Glyph) return null;
  return (
    <span className={className} aria-hidden>
      <Glyph />
    </span>
  );
}

/**
 * 로고 마크.
 *
 * 글자만 굵게 쓰면 자리표시자처럼 보인다. 맞물린 두 조각으로 "맞는가"를
 * 그린다 — 이 도구가 하는 일이 그것이다.
 */
export function LogoMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <path
        d="M3 6.2a1.6 1.6 0 0 1 1.6-1.6h4.2v3.1H7.1v4.6h1.7v3.1H4.6A1.6 1.6 0 0 1 3 13.8z"
        fill="currentColor"
      />
      <path
        d="M11.2 4.6h4.2A1.6 1.6 0 0 1 17 6.2v7.6a1.6 1.6 0 0 1-1.6 1.6h-4.2v-3.1h1.7V7.7h-1.7z"
        fill="currentColor"
        opacity="0.55"
      />
    </svg>
  );
}
