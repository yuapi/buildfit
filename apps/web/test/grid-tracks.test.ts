/**
 * 그리드 칸이 화면을 넘지 않는지 소스에서 막는다.
 *
 * `class="grid ..."`에 칸 수를 적지 않으면 칸이 `max-content`로 커진다.
 * 그러면 `truncate`가 듣지 않고 긴 모델명이 화면 밖으로 나간다 —
 * 실제로 부품 상세 페이지가 390px에서 30px 넘쳤다.
 *
 * Tailwind의 `grid-cols-N`은 `repeat(N, minmax(0, 1fr))`이라 칸을 가둔다.
 * 그래서 **`grid`를 쓰면 기본 칸 수를 함께 적는다.**
 *
 * 브라우저를 띄우지 않고 소스만 본다. 실물 확인은 따로 하지만, 되돌아오는 것을
 * 막는 데는 이쪽이 싸고 빠르다.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

/** `.tsx` 전부. `fs.globSync`는 아직 실험 기능이라 쓰지 않는다 */
function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return tsxFiles(full);
    return e.isFile() && e.name.endsWith('.tsx') ? [full] : [];
  });
}

/** `grid` 낱말이 든 className 값들 */
function gridClasses(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const cls = m[1] ?? m[2] ?? '';
    if (/(?:^|\s)grid(?:$|\s)/.test(cls)) out.push(cls);
  }
  return out;
}

/**
 * 칸 수가 정해졌는가.
 *
 * `grid-cols-*`(접두사 없는 것) 또는 `grid-rows-*`가 있어야 한다.
 * `sm:grid-cols-2`만 있으면 **좁은 화면에서** 칸이 안 가둬진다 — 그게 버그였다.
 * 직접 정의한 유틸(`row-grid`)은 CSS에서 칸을 정하므로 `grid` 낱말이 없다.
 */
function hasBaseColumns(cls: string): boolean {
  return /(?:^|\s)(?:grid-cols-|grid-rows-)/.test(cls);
}

describe('grid에는 기본 칸 수를 적는다', () => {
  const files = tsxFiles(SRC);

  it('검사할 파일이 있다', () => {
    // 목록이 조용히 0건이 되면 이 테스트가 아무것도 검사하지 않는다.
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files)('%s', (file) => {
    const found = gridClasses(readFileSync(file, 'utf8'));
    for (const cls of found) {
      expect(
        hasBaseColumns(cls),
        `칸 수 없는 grid: "${cls}"\n  → grid-cols-1을 더한다. 없으면 칸이 max-content로 커져 truncate가 듣지 않는다`,
      ).toBe(true);
    }
  });
});
