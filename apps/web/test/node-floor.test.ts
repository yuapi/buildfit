/**
 * Node 하한 — ADR-0030. 2026-10 보안 릴리스(22.23.4) 아래로 내려가지 않는다.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
// 경로를 변수로 두어 tsc가 .mjs의 타입을 찾지 않게 한다
const modPath = join(ROOT, 'scripts/node-floor.mjs');
const { parseFloor, meetsFloor } = (await import(modPath)) as {
  parseFloor: (range: unknown) => [number, number, number];
  meetsFloor: (version: string, floor: [number, number, number]) => boolean;
};

describe('Node 하한 (ADR-0030)', () => {
  it('★ package.json의 하한이 2026-10 보안 릴리스 이상이다', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { engines: { node: string } };
    expect(meetsFloor(parseFloor(pkg.engines.node).join('.'), [22, 23, 4])).toBe(true);
  });

  it('버전을 숫자로 비교한다 — 글자 비교면 22.9가 22.23보다 크다', () => {
    const floor: [number, number, number] = [22, 23, 4];
    expect(meetsFloor('v22.23.4', floor)).toBe(true);
    expect(meetsFloor('22.23.10', floor)).toBe(true);
    expect(meetsFloor('22.24.0', floor)).toBe(true);
    expect(meetsFloor('24.1.0', floor)).toBe(true);
    expect(meetsFloor('22.23.3', floor)).toBe(false);
    expect(meetsFloor('22.9.0', floor)).toBe(false);
    expect(meetsFloor('20.19.5', floor)).toBe(false);
  });

  it('모르는 모양의 하한은 통과시키지 않고 멈춘다', () => {
    for (const bad of ['^22.23.4', '>=22', '22.x', '', undefined]) {
      expect(() => parseFloor(bad), String(bad)).toThrow();
    }
  });

  it('스크립트가 지금 Node의 결과를 종료 코드로 낸다', () => {
    const r = spawnSync(process.execPath, [modPath], { encoding: 'utf8' });
    const floor = parseFloor(
      (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { engines: { node: string } }).engines.node,
    );
    expect(r.status).toBe(meetsFloor(process.versions.node, floor) ? 0 : 1);
  });
});
