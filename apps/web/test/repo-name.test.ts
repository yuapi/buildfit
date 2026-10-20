/**
 * 레포 이름을 코드에 박지 않는다 — ADR-0019.
 *
 * 레포는 `partfit`인데 제품·코드·문서는 `buildfit`이었다. 고치는 쪽은 레포인데,
 * **그게 가능한 이유는 레포 이름이 코드 어디에도 없기 때문이다.** 한 번이라도
 * 박아두면 다음 개명이 코드 변경이 된다.
 *
 * 문서의 이슈 링크가 `../../issues/N` 상대 경로인 것도 같은 이유다.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** 이 프로젝트의 GitHub 소유자. 외부 레포(BuildCores 등)는 상관없다 */
const OWNER = 'yuapi';

/**
 * 예외는 하나뿐이다 — **개명 자체를 적은 문서.**
 *
 * 거기서는 주소가 내용이다. 사용자가 그대로 복사해 쓸 명령이라 흐리면
 * 쓸모가 없다. 목록이 길어지면 규칙이 무너진 것이니 그때 다시 본다.
 */
const ALLOWED = new Set(['docs/decisions/0019-product-name.md']);

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'coverage']);
const EXTS = ['.ts', '.tsx', '.md', '.json', '.yml', '.yaml', '.css'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (SKIP_DIRS.has(e.name)) return [];
    const full = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(full);
    return e.isFile() && EXTS.some((x) => e.name.endsWith(x)) ? [full] : [];
  });
}

describe('레포 이름이 코드에 박히지 않는다', () => {
  const files = sourceFiles(ROOT).filter((f) => !f.endsWith('repo-name.test.ts'));

  it('검사할 파일이 있다', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it('★ 이 프로젝트의 GitHub 주소를 절대 경로로 적지 않는다', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      // `github.com/yuapi/…`. 다른 소유자(buildcores 등)는 외부 출처라 괜찮다.
      // ROOT가 `/`로 끝나는지에 따라 선행 슬래시가 갈린다. 한쪽으로 맞춘다.
      const rel = file.slice(ROOT.length).replace(/^\//, '');
      if (ALLOWED.has(rel)) continue;
      if (new RegExp(`github\\.com/${OWNER}/`).test(text)) offenders.push(rel);
    }
    expect(
      offenders,
      `레포 주소를 박은 곳: ${offenders.join(', ')}\n` +
        '  → 이슈는 `../../issues/N` 상대 경로로 적는다. 레포를 개명해도 그대로 동작한다.',
    ).toEqual([]);
  });

  it('제품 이름이 문서에 적혀 있다 — 암묵이면 또 갈라진다', () => {
    for (const doc of ['README.md', 'CLAUDE.md']) {
      expect(readFileSync(join(ROOT, doc), 'utf8'), doc).toContain('ADR-0019');
    }
  });
});
