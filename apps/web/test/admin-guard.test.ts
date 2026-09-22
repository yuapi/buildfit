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

/**
 * 직접 막는 대신 **막는 함수에 위임하는 것**도 인정한다.
 *
 * `saveSpecCore`는 검증·기록 본체이고 첫 줄에서 `requireAdmin()`을 부른다.
 * 두 화면(부품 하나 / 한 필드 줄줄이)이 그것을 공유하므로, 위임을 인정하지
 * 않으면 같은 호출을 형식적으로 한 번 더 적게 되고 그게 진짜 방어처럼 보인다.
 *
 * 대신 **위임 대상이 실제로 막는지를 따로 확인한다.** 그러지 않으면 이 예외가
 * 구멍이 된다 — 여기 이름만 올리면 통과하는 셈이 되어서는 안 된다.
 */
const GATED_HELPERS: readonly { readonly name: string; readonly file: string }[] = [
  { name: 'saveSpecCore', file: 'spec-save.ts' },
];

describe('어드민 접근 제어', () => {
  it('막을 대상을 실제로 찾았다', () => {
    // 이 테스트가 0개를 훑으면서 통과하는 일이 없어야 한다
    expect(entryPoints.length).toBeGreaterThanOrEqual(4);
  });

  it.each(entryPoints.map((f) => [f.slice(ADMIN_DIR.length + 1), f]))(
    '%s 가 requireAdmin을 부르거나 막는 함수에 위임한다',
    (_name, file) => {
      const text = readFileSync(file, 'utf8');
      const gated =
        text.includes('await requireAdmin()') ||
        GATED_HELPERS.some((h) => text.includes(`${h.name}(`));
      expect(gated, '직접 막지도, 막는 함수에 위임하지도 않는다').toBe(true);
    },
  );

  it.each(GATED_HELPERS.map((h) => [h.name, h.file] as const))(
    '위임 대상 %s 가 스스로 requireAdmin을 부른다',
    (name, file) => {
      const text = readFileSync(join(ADMIN_DIR, file), 'utf8');
      expect(text, `${name}이 ${file}에 없다`).toContain(`export async function ${name}`);
      expect(text).toContain('await requireAdmin()');
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
