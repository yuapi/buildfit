/**
 * 비교 표의 줄 순서.
 *
 * 이 화면의 목적은 차이를 보는 것이다. 키 이름 순으로 늘어놓으면
 * 스펙 10개 중 2개가 표 가운데 묻혔다.
 */

import { describe, expect, it } from 'vitest';
import { alignSpecs } from '../src/lib/compare';

const spec = (key: string, value: unknown) => ({ key, value, unit: null });
const text = (r: { value: unknown }) => String(r.value);
const keys = (rows: { key: string }[]) => rows.map((r) => r.key);

describe('다른 항목이 앞으로 온다', () => {
  it('★ 차이가 표 가운데 묻히지 않는다', () => {
    const rows = alignSpecs(
      [spec('a', 1), spec('m', 1), spec('z', 1)],
      [spec('a', 1), spec('m', 2), spec('z', 1)],
      text,
    );
    expect(keys(rows)).toEqual(['m', 'a', 'z']);
  });

  it('★ 같은 값끼리는 키 이름 순 그대로다', () => {
    // 한 번 본 표를 다시 봤을 때 순서가 바뀌면 무엇이 달라졌는지 알 수 없다.
    const rows = alignSpecs(
      [spec('c', 1), spec('a', 1), spec('b', 1)],
      [spec('c', 1), spec('a', 1), spec('b', 1)],
      text,
    );
    expect(keys(rows)).toEqual(['a', 'b', 'c']);
  });

  it('다른 것끼리도 키 이름 순이다', () => {
    const rows = alignSpecs(
      [spec('z', 1), spec('a', 1)],
      [spec('z', 2), spec('a', 2)],
      text,
    );
    expect(keys(rows)).toEqual(['a', 'z']);
  });
});

describe('한쪽에만 있는 항목', () => {
  it('빠뜨리지 않는다', () => {
    const rows = alignSpecs([spec('only_left', 1)], [spec('only_right', 2)], text);
    expect(keys(rows).sort()).toEqual(['only_left', 'only_right']);
  });

  it('★ 없는 것과 있는 것은 다름이다', () => {
    const [row] = alignSpecs([spec('x', 1)], [], text);
    expect(row?.differs).toBe(true);
    expect(row?.lText).toBe('1');
    // `null`이다. 빈 문자열이면 화면이 "값이 비어 있다"로 읽는다.
    expect(row?.rText).toBeNull();
  });

  it('둘 다 없으면 줄이 생기지 않는다', () => {
    expect(alignSpecs([], [], text)).toEqual([]);
  });
});

describe('글자로 비교한다', () => {
  it('★ 표시값이 같으면 같은 것으로 본다', () => {
    // 화면에 같게 보이는데 "다름"이라고 적으면 사용자가 믿지 않는다.
    // 120과 "120"은 단위를 붙인 뒤 같은 글자가 된다.
    const rows = alignSpecs([spec('tdp', 120)], [spec('tdp', '120')], text);
    expect(rows[0]?.differs).toBe(false);
  });
});
