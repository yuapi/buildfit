/**
 * `.chip`이 화면을 넘지 않는가.
 *
 * `white-space: nowrap`만 두면 긴 부품 이름이 390px 화면을 그대로 뚫는다.
 * 실제로 스토리지 이름에서 92px가 넘쳤다 — 카탈로그에서 가장 긴 이름이
 * 스토리지에 있다. 브라우저 점검이 잡아 줬지만, 그 점검은 CI에서 돌지 않는다.
 *
 * `grid-tracks.test.ts`와 같은 종류의 소스 검사다.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, '../src/app/globals.css'), 'utf8');

function ruleBody(selector: string): string {
  const at = css.indexOf(`${selector} {`);
  expect(at, `${selector} 규칙이 없다`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
}

describe('.chip 넘침 방어', () => {
  const body = ruleBody('.chip');

  it('nowrap을 쓴다 — 칩은 한 줄이다', () => {
    expect(body).toContain('white-space: nowrap');
  });

  it('★ nowrap을 쓰면 최대 폭이 함께 있어야 한다', () => {
    // 둘 중 하나만 있으면 긴 글자가 화면을 뚫는다
    expect(body).toContain('max-width: 100%');
    expect(body).toContain('overflow: hidden');
  });
});

describe('부품 이름을 담는 칩은 잘라서 보여준다', () => {
  const page = readFileSync(
    join(import.meta.dirname, '../src/app/build/[code]/page.tsx'),
    'utf8',
  );

  it('공유 견적의 요약 칩이 이름을 truncate한다', () => {
    // overflow:hidden만으로는 글자가 중간에서 잘린 채 끝난다. `…`가 필요하다
    expect(page).toMatch(/truncate[^"]*text-fg["\s]/);
  });
});
