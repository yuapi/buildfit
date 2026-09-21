/**
 * 방향키가 짚는 자리.
 *
 * 되감김과 경계는 손으로 눌러보며 확인하기 번거롭다. 여기서 고정한다.
 */

import { describe, expect, it } from 'vitest';
import { NO_CURSOR, nextCursor } from '../src/lib/list-cursor';

describe('아래로', () => {
  it('아무것도 짚지 않은 상태에서 첫 항목으로', () => {
    expect(nextCursor('ArrowDown', NO_CURSOR, 5)).toBe(0);
  });

  it('한 칸씩 내려간다', () => {
    expect(nextCursor('ArrowDown', 0, 5)).toBe(1);
    expect(nextCursor('ArrowDown', 3, 5)).toBe(4);
  });

  it('★ 끝에서 처음으로 감긴다', () => {
    // 멈추면 아래로만 갈 수 있는 줄 알기 쉽다.
    expect(nextCursor('ArrowDown', 4, 5)).toBe(0);
  });
});

describe('위로', () => {
  it('★ 아무것도 짚지 않은 상태에서 마지막 항목으로', () => {
    expect(nextCursor('ArrowUp', NO_CURSOR, 5)).toBe(4);
  });

  it('한 칸씩 올라간다', () => {
    expect(nextCursor('ArrowUp', 3, 5)).toBe(2);
  });

  it('처음에서 끝으로 감긴다', () => {
    expect(nextCursor('ArrowUp', 0, 5)).toBe(4);
  });
});

describe('처음과 끝', () => {
  it('Home과 End', () => {
    expect(nextCursor('Home', 3, 5)).toBe(0);
    expect(nextCursor('End', 0, 5)).toBe(4);
  });
});

describe('우리 키가 아닌 것', () => {
  it('★ null을 돌려준다 — 호출부가 preventDefault를 하지 않아야 한다', () => {
    // 여기서 막으면 글자 이동·문자 입력 같은 기본 동작이 사라진다.
    for (const key of ['ArrowLeft', 'ArrowRight', 'Tab', 'a', 'Enter', 'PageDown']) {
      expect(nextCursor(key, 0, 5), key).toBeNull();
    }
  });

  it('★ 목록이 비면 어떤 키도 자리를 만들지 않는다', () => {
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
      expect(nextCursor(key, NO_CURSOR, 0), key).toBeNull();
    }
  });

  it('항목이 하나면 제자리다', () => {
    expect(nextCursor('ArrowDown', 0, 1)).toBe(0);
    expect(nextCursor('ArrowUp', 0, 1)).toBe(0);
  });
});
