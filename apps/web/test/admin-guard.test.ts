/**
 * 어드민의 모든 화면과 서버 동작이 스스로 막는가 (ADR-0020).
 *
 * **레이아웃에서만 막으면 늦다.** `notFound()`를 레이아웃에서 던져도 페이지
 * 세그먼트는 이미 렌더되어, 404 응답의 본문에 어드민 데이터가 그대로 실린다.
 * 실제로 프록시를 끄고 확인한 동작이다. 그래서 각 화면이 **데이터를 만지기 전에**
 * 직접 막아야 하고, 이 테스트가 새 화면이 그걸 빠뜨리는 것을 잡는다.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ADMIN_DIR = join(import.meta.dirname, '../src/app/admin');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

const files = walk(ADMIN_DIR);

/** 요청을 받아 무언가를 내주거나 바꾸는 파일. 클라이언트 컴포넌트는 서버가 아니다. */
const entryPoints = files.filter((f) => {
  const name = f.slice(ADMIN_DIR.length + 1);
  if (!/(^|\/)(page|route|actions)\.tsx?$/.test(name)) return false;
  return !readFileSync(f, 'utf8').startsWith("'use client'");
});

describe('어드민 접근 제어', () => {
  it('막을 대상을 실제로 찾았다', () => {
    // 이 테스트가 0개를 훑으면서 통과하는 일이 없어야 한다
    expect(entryPoints.length).toBeGreaterThanOrEqual(4);
  });

  it.each(entryPoints.map((f) => [f.slice(ADMIN_DIR.length + 1), f]))(
    '%s 가 requireAdmin을 부른다',
    (_name, file) => {
      expect(readFileSync(file, 'utf8')).toContain('await requireAdmin()');
    },
  );

  it('레이아웃도 막지만 그것에 기대지 않는다', () => {
    const layout = readFileSync(join(ADMIN_DIR, 'layout.tsx'), 'utf8');
    expect(layout).toContain('await requireAdmin()');
    // page.tsx들이 각자 막는지는 위에서 확인한다 — 레이아웃은 마지막 보루가 아니다
    const pages = entryPoints.filter((f) => /page\.tsx$/.test(f));
    expect(pages.length).toBeGreaterThanOrEqual(3);
  });
});
