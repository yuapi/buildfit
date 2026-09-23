/**
 * 헤더 메뉴가 두 줄로 접히지 않는가 — 이슈 #21.
 *
 * 390px에서 메뉴 네 개가 전부 두 줄이 되었고 「부품」은 「부/품」으로 글자마다 갈렸다.
 * 한국어는 글자 사이에서 줄이 바뀐다. 전수 점검은 「가로 넘침 0」을 봤는데 이것은
 * 넘치지 않고 **접혀서** 잡히지 않았다. 브라우저 점검은 CI에서 돌지 않으므로 소스를 본다.
 *
 * `chip-overflow.test.ts`와 같은 종류의 소스 검사다.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(join(import.meta.dirname, '../src/components/SiteShell.tsx'), 'utf8');
const header = src.slice(src.indexOf('export function SiteHeader'), src.indexOf('export function SiteFooter'));

describe('헤더 메뉴 (이슈 #21)', () => {
  it('메뉴 링크는 줄을 바꾸지 않는다', () => {
    const nav = header.slice(header.indexOf('<nav'), header.indexOf('</nav>'));
    expect(nav, '메뉴 링크에 whitespace-nowrap이 없다 — 「부/품」이 돌아온다').toContain(
      'whitespace-nowrap',
    );
  });

  it('★ 줄을 안 바꾸면 모자랄 때 갈 곳이 있어야 한다 — 메뉴가 가로로 밀린다', () => {
    // nowrap만 두면 메뉴가 헤더 밖으로 나가 페이지 전체가 가로로 넘친다
    const navTag = header.slice(header.indexOf('<nav'), header.indexOf('>', header.indexOf('<nav')));
    expect(navTag).toContain('min-w-0');
    expect(navTag).toContain('overflow-x-auto');
  });

  it('좁은 화면에서 워드마크를 숨겨도 홈 링크의 이름은 남는다', () => {
    expect(header).toContain('hidden sm:inline');
    expect(header).toContain('aria-label="buildfit 홈"');
  });
});
