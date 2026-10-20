/**
 * 보간한 값 바로 뒤에 조사를 붙이지 않는다.
 *
 * 한국어 조사는 앞말의 끝소리에 따라 갈린다 — 받침이 있으면 「이·을·은·과」, 없으면
 * 「가·를·는·와」. 그런데 부품 이름·소켓·칩셋은 끝소리가 제각각이다.
 * `AM5`는 모음으로, `LGA 1700`은 받침으로 끝난다. 그래서
 *
 *     `${socket}이 없습니다`
 *
 * 는 소켓에 따라 반은 틀린다. 실제로 규칙 20이 「AM5이 없습니다」로 나갔고,
 * 비교 페이지의 **검색 결과 설명**이 `${a}와 ${b}의`로 되어 있었다.
 *
 * 고치는 방법은 둘이다.
 * - 조사를 뒤에 붙인 한국어 명사에 붙인다 — `${socket} 소켓이`, `${chipset} 칩은`
 * - 끝소리와 무관한 「의」를 쓴다 — `${pcCase.name}의 지원 폼팩터`
 *
 * 화면을 렌더링하지 않고 소스만 본다. 되돌아오는 것을 막는 데는 이쪽이 싸다.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOTS = ['../src', '../../../packages/compat/src', '../../../packages/db/src'].map((r) =>
  fileURLToPath(new URL(r, import.meta.url)),
);

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return sources(full);
    return e.isFile() && /\.tsx?$/.test(e.name) ? [full] : [];
  });
}

/**
 * `${…}`나 JSX `{…}` 바로 뒤에 끝소리를 타는 조사가 오고, 그 뒤가 한글이 아닌 것.
 *
 * JSX도 본다 (이슈 #50). 템플릿만 보다가 부품 페이지의 `{c.modelName}와 비교`가
 * 「AMD Ryzen 5 9600와 비교」로 나갔다.
 *
 * 뒤가 한글이면 조사가 아니라 낱말의 일부일 수 있어 뺀다 (`${n}개`, `${x}이상`).
 * 「의·에·도·만·까지」처럼 끝소리를 타지 않는 조사는 괜찮다.
 */
const PARTICLE = /\{[^{}]+\}(이|가|을|를|은|는|과|와|으로|로)(?![가-힣])/;

describe('보간한 값 바로 뒤에 조사를 붙이지 않는다', () => {
  const files = ROOTS.flatMap(sources);

  it('훑을 파일을 실제로 찾았다', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('★ 어긋나는 곳이 없다', () => {
    const hits: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        // 주석은 사람이 읽는 설명이라 뺀다 — 이 파일의 예시처럼
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        if (PARTICLE.test(line)) hits.push(`${file.split('/src/')[1] ?? file}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(
      hits,
      '조사를 뒤에 붙인 명사에 붙이거나(`${s} 소켓이`) 「의」를 쓴다:\n' + hits.join('\n'),
    ).toEqual([]);
  });

  it('검사식이 실제로 잡는다 — 헛도는 가드가 아니다', () => {
    expect(PARTICLE.test('`${socket}이 없습니다`')).toBe(true);
    expect(PARTICLE.test('`${a}와 ${b}의 스펙`')).toBe(true);
    expect(PARTICLE.test('`${name}로 바꾼다`')).toBe(true);
    expect(PARTICLE.test('{c.modelName}와 비교')).toBe(true);
    expect(PARTICLE.test('규칙 {id}이 쓰는')).toBe(true);
    // 괜찮은 것들
    expect(PARTICLE.test('`${socket} 소켓이 없습니다`')).toBe(false);
    expect(PARTICLE.test('`${name}의 지원 폼팩터`')).toBe(false);
    expect(PARTICLE.test('`${n}개`')).toBe(false);
    expect(PARTICLE.test('`${x}이상`')).toBe(false);
    expect(PARTICLE.test('규칙 {id}번이 쓰는')).toBe(false);
    expect(PARTICLE.test('{name}하고 비교')).toBe(false);
  });
});
