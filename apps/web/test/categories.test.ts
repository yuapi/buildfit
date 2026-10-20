import { describe, expect, it } from 'vitest';
import {
  CATEGORY_LABELS,
  INDEXED_CATEGORIES,
  categoryFromSlug,
  categoryLabel,
} from '../src/lib/categories';

describe('카테고리 주소 매핑', () => {
  it('소문자 주소에서 DB 카테고리를 찾는다', () => {
    expect(categoryFromSlug('cpu')).toBe('CPU');
    expect(categoryFromSlug('pccase')).toBe('PCCase');
    expect(categoryFromSlug('cpucooler')).toBe('CPUCooler');
  });

  it('대소문자가 달라도 찾는다', () => {
    expect(categoryFromSlug('PCCase')).toBe('PCCase');
  });

  it('모르는 주소는 null', () => {
    expect(categoryFromSlug('keyboard')).toBeNull();
    expect(categoryFromSlug('')).toBeNull();
  });

  it('★ GPUChip은 공개 색인 대상이 아니다', () => {
    // 적재가 chipset으로 유도해 만든 내부 레코드다. 스펙이 없어 주소를 주면
    // §8이 경계한 저품질 페이지가 된다.
    expect(INDEXED_CATEGORIES).not.toContain('GPUChip');
    expect(categoryFromSlug('gpuchip')).toBeNull();
  });

  it('MVP 6종이 전부 색인 대상이다', () => {
    for (const c of ['CPU', 'Motherboard', 'RAM', 'GPU', 'PCCase', 'PSU']) {
      expect(INDEXED_CATEGORIES).toContain(c);
    }
  });

  it('모든 색인 카테고리에 한글 이름이 있다', () => {
    for (const c of INDEXED_CATEGORIES) {
      expect(CATEGORY_LABELS[c]).toBeTruthy();
      expect(categoryLabel(c)).not.toBe(c === 'CPU' ? '' : c);
    }
  });

  it('모르는 카테고리는 이름을 그대로 돌려준다 — 값을 숨기지 않는다', () => {
    expect(categoryLabel('Keyboard')).toBe('Keyboard');
  });
});
