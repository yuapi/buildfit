/**
 * 색 대비 — ADR-0014.
 *
 * "라이트·다크 모두 본문 4.5:1 이상"은 눈으로 지킬 수 없다. 토큰을 한 번
 * 손보면 다른 조합이 조용히 깨진다. 값에서 직접 계산해 고정한다.
 *
 * 기준은 WCAG 2.1 AA — 본문 4.5:1, 큰 글씨·비문자 요소 3:1.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(fileURLToPath(new URL('../src/app/globals.css', import.meta.url)), 'utf8');

/** 선택자 블록 안의 `--color-*: #rrggbb`를 모은다. */
function tokens(selector: string): Record<string, string> {
  const at = CSS.indexOf(selector);
  if (at === -1) throw new Error(`${selector} 블록을 찾지 못했다`);
  const open = CSS.indexOf('{', at);
  const close = CSS.indexOf('\n}', open);
  const out: Record<string, string> = {};
  for (const m of CSS.slice(open, close).matchAll(/(--color-[\w-]+):\s*(#[0-9a-f]{6})/gi)) {
    out[m[1]!] = m[2]!;
  }
  return out;
}

function luminance(hex: string): number {
  const ch = [1, 3, 5]
    .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const LIGHT = tokens(':root {');
const DARK = tokens(":root[data-theme='dark']");

/** 글자가 놓일 수 있는 모든 배경. 가장 불리한 조합으로 검사한다. */
const SURFACES = ['--color-bg', '--color-surface', '--color-surface-2'] as const;

/** 본문 크기 글자. 4.5:1을 넘어야 한다. */
const TEXT_TOKENS = [
  '--color-fg',
  '--color-fg-muted',
  '--color-fg-subtle',
  '--color-ok',
  '--color-warn',
  '--color-danger',
  '--color-info',
  '--color-unknown',
] as const;

/** 판정 색과 그 배경 짝. 배지·알림 상자에 그대로 쓰인다. */
const VERDICT_PAIRS = [
  ['--color-ok', '--color-ok-bg'],
  ['--color-warn', '--color-warn-bg'],
  ['--color-danger', '--color-danger-bg'],
  ['--color-info', '--color-info-bg'],
  ['--color-unknown', '--color-unknown-bg'],
] as const;

describe.each([
  ['라이트', LIGHT],
  ['다크', DARK],
] as const)('%s 테마 대비 (ADR-0014)', (_name, theme) => {
  it('토큰 값이 모두 읽혔다', () => {
    for (const t of [...TEXT_TOKENS, ...SURFACES]) {
      expect(theme[t], t).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it.each(TEXT_TOKENS.flatMap((fg) => SURFACES.map((bg) => [fg, bg] as const)))(
    '%s on %s 이 4.5:1 이상',
    (fg, bg) => {
      expect(contrast(theme[fg]!, theme[bg]!)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(VERDICT_PAIRS)('%s 이 자기 배경(%s) 위에서 4.5:1 이상', (fg, bg) => {
    expect(contrast(theme[fg]!, theme[bg]!)).toBeGreaterThanOrEqual(4.5);
  });

  it('버튼 글자가 버튼 배경 위에서 읽힌다', () => {
    expect(contrast(theme['--color-action-fg']!, theme['--color-action']!)).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it.each(SURFACES)('입력 필드 경계가 %s 위에서 3:1 이상', (bg) => {
    // WCAG 1.4.11. 경계가 안 보이면 어디를 눌러야 하는지 알 수 없다.
    // 장식용 카드 테두리(--color-border)는 이 기준의 대상이 아니다.
    expect(contrast(theme['--color-border-strong']!, theme[bg]!)).toBeGreaterThanOrEqual(3);
  });
});

describe.each([
  ['라이트', LIGHT],
  ['다크', DARK],
] as const)('%s 테마 크롬 대비 (ADR-0015)', (_name, theme) => {
  // 헤더·푸터는 본문과 다른 배경을 쓴다. 본문 토큰만 검사하면 여기가 조용히 깨진다.
  it('크롬 글자가 크롬 배경 위에서 4.5:1 이상', () => {
    expect(contrast(theme['--color-chrome-fg']!, theme['--color-chrome']!)).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it('크롬의 흐린 글자(네비)도 4.5:1 이상', () => {
    expect(
      contrast(theme['--color-chrome-muted']!, theme['--color-chrome']!),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('브랜드 색이 크롬 위에서 3:1 이상 — 로고와 경계선에 쓴다', () => {
    // 글자가 아니라 표식이므로 비문자 기준(WCAG 1.4.11)을 쓴다
    expect(contrast(theme['--color-brand']!, theme['--color-chrome']!)).toBeGreaterThanOrEqual(3);
  });
});

describe('토큰 규율', () => {
  it('라이트와 다크가 같은 토큰 집합을 정의한다', () => {
    // 한쪽에만 있는 토큰은 그 테마에서 값이 비어 색이 사라진다
    expect(Object.keys(DARK).sort()).toEqual(Object.keys(LIGHT).sort());
  });

  it('prefers-color-scheme 블록과 data-theme 블록의 값이 같다', () => {
    // 둘이 갈라지면 시스템 다크와 수동 다크의 화면이 달라진다
    const media = tokens(":root:not([data-theme='light'])");
    expect(media).toEqual(DARK);
  });
});
