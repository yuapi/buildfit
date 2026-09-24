/**
 * 판정 필드를 부품별로 묶는다 — 이슈 #46.
 */

import { describe, expect, it } from 'vitest';
import { groupFieldsByPart } from '../src/lib/field-refs';

const psu = { part: 'Corsair RM750e', slug: 'corsair-rm750e' };
const gpu = { part: 'RTX 4070 SUPER', slug: 'rtx-4070-super' };

describe('groupFieldsByPart', () => {
  it('★ 같은 부품의 필드는 한 묶음이다 — 부품 이름을 되풀이하지 않는다', () => {
    const g = groupFieldsByPart([
      { ...psu, field: 'PCIe 6+2핀 커넥터 수' },
      { ...psu, field: '12VHPWR 커넥터 수' },
    ]);
    expect(g).toEqual([{ part: psu.part, slug: psu.slug, fields: ['PCIe 6+2핀 커넥터 수', '12VHPWR 커넥터 수'] }]);
  });

  it('처음 나온 순서를 지킨다', () => {
    const g = groupFieldsByPart([
      { ...gpu, field: '보조전원 커넥터 구성' },
      { ...psu, field: 'PCIe 6+2핀 커넥터 수' },
      { ...gpu, field: '소비전력(TDP)' },
    ]);
    expect(g.map((x) => x.part)).toEqual([gpu.part, psu.part]);
    expect(g[0]!.fields).toEqual(['보조전원 커넥터 구성', '소비전력(TDP)']);
  });

  it('같은 필드는 한 번만', () => {
    const g = groupFieldsByPart([
      { ...psu, field: '정격 출력' },
      { ...psu, field: '정격 출력' },
    ]);
    expect(g[0]!.fields).toEqual(['정격 출력']);
  });

  it('이름이 같아도 slug가 다르면 다른 부품이다 — 메모리 키트 두 개', () => {
    const g = groupFieldsByPart([
      { part: 'Kit', slug: 'kit-a', field: '용량' },
      { part: 'Kit', slug: 'kit-b', field: '용량' },
    ]);
    expect(g).toHaveLength(2);
  });

  it('slug가 없으면 이름으로 묶는다', () => {
    const g = groupFieldsByPart([
      { part: 'A', field: 'x' },
      { part: 'A', field: 'y' },
    ]);
    expect(g).toEqual([{ part: 'A', slug: undefined, fields: ['x', 'y'] }]);
  });

  it('비어 있으면 빈 목록', () => {
    expect(groupFieldsByPart([])).toEqual([]);
  });
});
