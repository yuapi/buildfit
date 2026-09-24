/**
 * 판정 결과가 가리키는 필드를 부품별로 묶는다 — 이슈 #46.
 *
 * 필드마다 부품 이름을 붙이면 한 줄에 같은 이름이 되풀이된다. 규칙 8의 「데이터 이상」이
 * 「Corsair RM750e (2022) 750W 80+ Gold …의 PCIe 6+2핀 커넥터 수, Corsair RM750e (2022)
 * 750W 80+ Gold …의 12VHPWR 커넥터 수」였다 — 모바일에서 여섯 줄을 넘었다.
 */

import type { FieldRef } from '@buildfit/compat';

export interface PartFields {
  readonly part: string;
  readonly slug: string | undefined;
  readonly fields: readonly string[];
}

/** 처음 나온 순서를 지킨다. 같은 부품의 같은 필드는 한 번만 적는다 */
export function groupFieldsByPart(refs: readonly FieldRef[]): PartFields[] {
  const groups = new Map<string, { part: string; slug: string | undefined; fields: string[] }>();
  for (const r of refs) {
    // slug가 부품을 가리키는 열쇠다. 없으면 이름으로 — 같은 이름의 다른 부품은 slug가 가른다
    const key = r.slug ?? `name:${r.part}`;
    const g = groups.get(key) ?? { part: r.part, slug: r.slug, fields: [] };
    if (!g.fields.includes(r.field)) g.fields.push(r.field);
    groups.set(key, g);
  }
  return [...groups.values()];
}
