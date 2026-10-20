/**
 * 라우트 파일이 전부 git에 들어 있는가.
 *
 * `.gitignore`의 `build/`(빌드 산출물용)가 **`/build/[code]` 라우트 폴더까지
 * 삼켰다.** 공유 링크 화면은 이 프로젝트의 핵심인데(ADR-0012: 견적의 정본은
 * 공유 URL) 한동안 커밋되지 않고 있었다.
 *
 * **CI는 이것을 잡지 못한다.** 파일이 없으면 그 라우트가 안 만들어질 뿐이고
 * 빌드도 테스트도 통과한다. 로컬에는 파일이 있으니 화면도 잘 돈다.
 * 클론한 사람에게만 없다.
 *
 * 그래서 파일 목록을 git에 직접 물어본다.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP = join(import.meta.dirname, '../src/app');
const REPO = join(import.meta.dirname, '../../..');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

/** git이 아는 파일. 무시된 파일은 여기 없다. */
const tracked = new Set(
  execFileSync('git', ['ls-files', 'apps/web/src/app'], { cwd: REPO, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean),
);

const onDisk = walk(APP)
  .filter((f) => /\.(tsx?|css)$/.test(f))
  .map((f) => relative(REPO, f));

describe('라우트 파일이 git에 들어 있다', () => {
  it('훑을 파일을 실제로 찾았다', () => {
    // 이 테스트가 0개를 훑으면서 통과하는 일이 없어야 한다
    expect(onDisk.length).toBeGreaterThan(15);
    expect(tracked.size).toBeGreaterThan(15);
  });

  it('★ .gitignore가 라우트를 삼키지 않는다', () => {
    const missing = onDisk.filter((f) => !tracked.has(f));
    expect(missing, `git이 모르는 라우트 파일: ${missing.join(', ')}`).toEqual([]);
  });

  it('공유 링크 화면이 들어 있다 — 실제로 빠져 있던 파일이다', () => {
    expect([...tracked].some((f) => f.includes('app/build/'))).toBe(true);
  });
});
