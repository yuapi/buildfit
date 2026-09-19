import { describe, expect, it } from 'vitest';
import { hasFinalConsonant, josa, listWithJosa } from '../src/lib/korean';

describe('받침 판정', () => {
  it('받침이 있으면 true', () => {
    expect(hasFinalConsonant('파워')).toBe(false);
    expect(hasFinalConsonant('케이스')).toBe(false);
    expect(hasFinalConsonant('메인보드')).toBe(false);
    expect(hasFinalConsonant('그래픽카드')).toBe(false);
    expect(hasFinalConsonant('메모리')).toBe(false);
    expect(hasFinalConsonant('쿨러')).toBe(false);
    expect(hasFinalConsonant('받침')).toBe(true);
    expect(hasFinalConsonant('마음')).toBe(true);
  });

  it('한글이 아니면 짐작하지 않는다', () => {
    expect(hasFinalConsonant('CPU')).toBeNull();
    expect(hasFinalConsonant('')).toBeNull();
  });
});

describe('조사 선택', () => {
  it('받침 유무로 고른다', () => {
    expect(josa('파워', '을', '를')).toBe('를');
    expect(josa('받침', '을', '를')).toBe('을');
  });

  it('판단할 수 없으면 받침 있는 쪽을 쓴다 — CPU를이 아니라 CPU를', () => {
    // 영문 약어는 읽는 소리로 갈린다. 규칙으로 맞히려다 더 어색해지므로 기본값을 쓴다
    expect(josa('CPU', '을', '를')).toBe('을');
  });

  it('목록은 마지막 항목 기준으로 조사를 붙인다', () => {
    expect(listWithJosa(['CPU', '케이스'], '을', '를')).toBe('CPU, 케이스를');
    expect(listWithJosa(['케이스', '파워'], '을', '를')).toBe('케이스, 파워를');
    expect(listWithJosa(['파워'], '이', '가')).toBe('파워가');
  });
});
