/**
 * sitemap과 robots가 같은 목록을 가리키는가.
 *
 * 어긋나도 **오류가 나지 않는다.** 색인이 그 파일을 못 찾을 뿐이고,
 * 아무도 모른 채 페이지가 빠진다.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { INDEXED_CATEGORIES } from '../src/lib/categories';
import { PAGES_SITEMAP_ID, STATIC_PAGES } from '../src/lib/site';

const APP = fileURLToPath(new URL('../src/app', import.meta.url));

describe('정적 페이지가 색인 목록에 있다', () => {
  it('★ 첫 화면이 들어 있다', () => {
    // 카테고리별 sitemap만 있던 동안 첫 화면이 어느 목록에도 없었다.
    expect(STATIC_PAGES.map((p) => p.path)).toContain('/');
  });

  it('주소가 전부 절대 경로다', () => {
    for (const p of STATIC_PAGES) expect(p.path.startsWith('/'), p.path).toBe(true);
  });

  it('중복이 없다', () => {
    const paths = STATIC_PAGES.map((p) => p.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('★ 목록에 적힌 페이지가 실제로 있다', () => {
    // 지운 페이지가 목록에 남으면 404가 색인된다.
    for (const p of STATIC_PAGES) {
      const dir = p.path === '/' ? APP : join(APP, p.path);
      const files = readdirSync(dir);
      expect(files.some((f) => f === 'page.tsx' || f === 'page.ts'), p.path).toBe(true);
    }
  });

  it('★ sitemap id가 카테고리 이름과 겹치지 않는다', () => {
    // 겹치면 카테고리 sitemap이 정적 페이지 목록으로 덮인다.
    expect(INDEXED_CATEGORIES.map((c) => c.toLowerCase())).not.toContain(PAGES_SITEMAP_ID);
  });

  it('★ robots가 정적 페이지 sitemap도 가리킨다', () => {
    // 소스를 본다. robots()를 부르려면 Next 런타임이 필요하다.
    const src = readFileSync(join(APP, 'robots.ts'), 'utf8');
    expect(src).toContain('PAGES_SITEMAP_ID');
  });
});
