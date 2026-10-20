/**
 * 페이지 제목이 「— buildfit」을 두 번 붙이지 않는다.
 *
 * `layout.tsx`가 `template: '%s — buildfit'`을 쓴다. 각 페이지가 접미사를
 * 직접 붙이면 **「부품 목록 — buildfit — buildfit」**이 된다. 실제로 여섯 곳이
 * 그랬다. 브라우저 탭과 검색 결과에 그대로 나가는데 오류가 나지 않아 안 보인다.
 *
 * 브랜드만 제목으로 쓰고 싶으면 `{ absolute: … }`로 템플릿을 건너뛴다.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const APP = fileURLToPath(new URL('../src/app', import.meta.url));

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return tsxFiles(full);
    return e.isFile() && e.name.endsWith('.tsx') ? [full] : [];
  });
}

/** `layout.tsx`가 붙이는 접미사. 여기서 바뀌면 검사도 같이 바뀌어야 한다 */
const SUFFIX = '— buildfit';

describe('제목에 접미사를 두 번 붙이지 않는다', () => {
  const files = tsxFiles(APP).filter((f) => !f.endsWith('layout.tsx'));

  it('템플릿이 그대로인지 먼저 본다', () => {
    const layout = readFileSync(join(APP, 'layout.tsx'), 'utf8');
    expect(layout).toContain(`template: '%s ${SUFFIX}'`);
  });

  it.each(files)('%s', (file) => {
    const text = readFileSync(file, 'utf8');
    // `title:` 뒤의 문자열 리터럴만 본다. `{ absolute: … }`는 템플릿을 안 탄다.
    for (const m of text.matchAll(/title:\s*(['"`])((?:[^\\]|\\.)*?)\1/g)) {
      /*
       * `openGraph.title`은 **템플릿을 타지 않는다.** layout의 `title.template`은
       * `metadata.title`에만 걸리므로, og 쪽은 접미사를 직접 붙여야 한 번 붙는다.
       * 앞 글자를 보고 og 블록 안인지 가린다 — 한 줄에 같이 쓰기 때문이다.
       */
      const before = text.slice(Math.max(0, m.index - 60), m.index);
      if (/openGraph:\s*\{[^}]*$/.test(before)) continue;

      const value = m[2] ?? '';
      expect(
        value.includes(SUFFIX),
        `제목이 접미사를 직접 붙인다: ${JSON.stringify(value)}\n` +
          `  → layout의 template이 붙여준다. 브랜드만 쓰려면 { absolute: … }.`,
      ).toBe(false);
    }
  });
});
