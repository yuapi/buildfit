/**
 * 부품에서 견적 구성으로 넘어가는 주소.
 *
 * SEO로 들어오는 곳은 부품 페이지다. 거기서 판정으로 이어지는 길이 없으면
 * 스펙만 읽고 떠난다. **견적의 정본은 URL이므로**(§8A.3) 부품 하나를 담은
 * 코드를 만들어 그 주소로 보낸다 — 서버에 아무것도 남기지 않는다.
 */

import { encodeBuildCode } from './build-code';
import { SLOT_META } from './categories';
import { isMultiSlot } from './multi-slot';

/** 이 부품 하나만 담은 견적 주소. 견적에 넣을 수 없는 카테고리면 `null` */
export function startBuildHref(category: string, id: string): string | null {
  const slot = SLOT_META.find((m) => m.category === category)?.slot;
  if (!slot) return null;
  // 목록 슬롯을 여기서 나열하지 않는다. `ram`만 적어 두었다가 스토리지가 목록
  // 슬롯으로 들어온 뒤 스토리지 부품 페이지가 전부 500이 됐다 (이슈 #26)
  const sel = isMultiSlot(slot) ? { [slot]: [id] } : { [slot]: id };
  return `/build/${encodeBuildCode(sel)}`;
}

