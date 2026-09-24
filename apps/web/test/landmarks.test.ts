/**
 * 본문 랜드마크 — 접근성 점검(axe)이 모든 페이지에서 잡은 것.
 *
 * `<main>`이 없어 화면 낭독기가 본문으로 건너뛸 곳이 없었고, 부품·견적 페이지 안의
 * `<header>`가 사이트 머리글과 겹쳐 banner가 둘로 읽혔다. 레이아웃이 `<main>`을 하나
 * 두고 페이지는 두지 않는다 — 겹치면 본문이 둘이 된다.
 *
 * 브라우저 점검은 CI에서 돌지 않으므로 소스를 본다 (`header-nav.test.ts`와 같은 종류).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '../src');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

function tsxFiles(dir: string): string[] {
  return readdirSync(join(SRC, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = join(dir, e.name);
    if (e.isDirectory()) return tsxFiles(rel);
    return e.name.endsWith('.tsx') ? [rel] : [];
  });
}

describe('본문 랜드마크', () => {
  it('레이아웃이 본문을 <main id="main">으로 감싼다', () => {
    expect(read('app/layout.tsx')).toMatch(/<main id="main"/);
  });

  it('★ 다른 곳은 <main>을 두지 않는다 — 본문이 둘이 된다', () => {
    const others = tsxFiles('.').filter((f) => f !== join('app', 'layout.tsx'));
    const offenders = others.filter((f) => /<main[\s>]/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('머리글 첫 요소가 본문으로 건너뛰는 링크다 (WCAG 2.4.1)', () => {
    const shell = read('components/SiteShell.tsx');
    const header = shell.slice(shell.indexOf('<header'), shell.indexOf('</header>'));
    const firstLink = header.indexOf('<a');
    expect(firstLink).toBeGreaterThan(-1);
    expect(header.indexOf('<Link')).toBeGreaterThan(firstLink);
    expect(header.slice(firstLink, header.indexOf('</a>'))).toContain('href="#main"');
  });
});
