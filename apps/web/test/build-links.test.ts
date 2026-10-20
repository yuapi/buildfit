/**
 * 부품 페이지의 「이 부품으로 견적 시작」 링크 — 이슈 #26.
 *
 * **스토리지 부품 페이지 3,439개가 전부 500이었다.** 이 헬퍼가 목록 슬롯을 메모리
 * 하나로만 알아서, 스토리지 id를 문자열 그대로 인코더에 넘겼다. 계산된 키
 * (`{ [slot]: id }`)라 타입 검사도 잡지 못했다.
 *
 * 슬롯을 하나씩 적지 않고 `SLOT_META` 전부를 돈다 — 다음에 슬롯이 늘어도 같은
 * 실수가 조용히 지나가지 않는다.
 */

import { describe, expect, it } from 'vitest';
import { decodeBuildCode } from '../src/lib/build-code';
import { startBuildHref } from '../src/lib/build-links';
import { SLOT_META } from '../src/lib/categories';
import { isMultiSlot } from '../src/lib/multi-slot';

const ID = 'aaaaaaaa-1111-4111-8111-111111111111';

describe('startBuildHref (이슈 #26)', () => {
  it.each(SLOT_META.map((m) => [m.category, m.slot] as const))(
    '%s 부품 하나를 담은 견적으로 되돌아온다',
    (category, slot) => {
      const href = startBuildHref(category, ID);
      expect(href).toMatch(/^\/build\//);
      const sel = decodeBuildCode(href!.slice('/build/'.length));
      expect(sel?.[slot]).toEqual(isMultiSlot(slot) ? [ID] : ID);
    },
  );

  it('견적에 넣을 수 없는 카테고리는 링크가 없다', () => {
    expect(startBuildHref('Monitor', ID)).toBeNull();
  });
});
