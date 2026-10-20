/**
 * 글자를 `opacity`로 옅게 만들지 않는다.
 *
 * **대비 테스트가 못 잡는 구멍이다.** `contrast.test.ts`는 토큰 값만 보므로
 * 투명도로 옅어진 실제 렌더링 대비를 모른다. 실제로 두 곳이 미달이었다.
 *
 * | 곳 | 라이트 | 다크 |
 * |---|---|---|
 * | 목록 페이지의 갈 수 없는 「이전」 (`opacity-40`) | 2.55:1 | 3.45:1 |
 * | 판정 띠의 미선택 안내 (`opacity-80`) | **3.38:1** | 5.60:1 |
 *
 * WCAG 1.4.3은 본문에 4.5:1을 요구한다. 색을 옅게 하는 대신 **무채색 토큰을
 * 쓰거나 모양을 바꾼다.**
 *
 * 예외는 **진짜 `disabled` 컨트롤**이다. WCAG는 동작하지 않는 컨트롤의 대비를
 * 요구하지 않는다("Incidental"). 그래서 `disabled:opacity-*`는 허용한다 —
 * 상태 접두사가 붙어 있으면 그 상태에서만 적용된다는 뜻이다.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return tsxFiles(full);
    return e.isFile() && e.name.endsWith('.tsx') ? [full] : [];
  });
}

/**
 * 상태 접두사 없는 `opacity-<숫자>`를 찾는다.
 *
 * `disabled:opacity-40`·`hover:opacity-80`처럼 앞에 `:`가 붙은 것은 넘긴다.
 * `opacity-100`은 옅게 만들지 않으므로 넘긴다.
 */
function bareOpacity(cls: string): string[] {
  const out: string[] = [];
  for (const token of cls.split(/\s+/)) {
    const m = /^opacity-(\d+)$/.exec(token);
    if (m && m[1] !== '100') out.push(token);
  }
  return out;
}

describe('글자를 투명도로 옅게 만들지 않는다', () => {
  const files = tsxFiles(SRC);

  it('검사할 파일이 있다', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files)('%s', (file) => {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      const cls = m[1] ?? m[2] ?? '';
      const found = bareOpacity(cls);
      expect(
        found,
        `투명도로 옅게 한 글자: ${found.join(' ')} — "${cls}"\n` +
          '  → 무채색 토큰(text-fg-muted 등)을 쓰거나 모양을 바꾼다.\n' +
          '  → 진짜 disabled 컨트롤이면 상태 접두사를 붙인다 (disabled:opacity-40).',
      ).toEqual([]);
    }
  });

  it('상태 접두사가 붙은 것은 허용한다', () => {
    expect(bareOpacity('btn btn-primary disabled:opacity-40')).toEqual([]);
    expect(bareOpacity('field disabled:opacity-50')).toEqual([]);
    expect(bareOpacity('opacity-100')).toEqual([]);
  });

  it('상태 접두사 없는 것은 잡는다', () => {
    expect(bareOpacity('text-xs opacity-80')).toEqual(['opacity-80']);
    expect(bareOpacity('btn btn-secondary opacity-40')).toEqual(['opacity-40']);
  });
});
