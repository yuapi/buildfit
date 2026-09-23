/**
 * 출시 연도가 소켓보다 앞서는 레코드에 `disputed`를 세운다 — 이슈 #18.
 *
 * 값은 고치지 않는다. 정답을 모르고, 지어낸 연도를 넣지 않는다. 판정도 바꾸지
 * 않는다(ADR-0021) — 「검증 중인 값으로 판정했습니다」가 붙고 어드민 목록에 뜬다.
 *
 * 연도는 `parts.release_year` 컬럼에 있어서 `disputed`를 세울 행이 없다. 그래서
 * `part_specs`에 같은 키(`release_year`)로 행을 만든다 — 어드민이 연도를 채울 때
 * 흔적을 남기는 자리와 같다(이슈 #15). 출처는 그 레코드의 OpenDB 파일이다.
 *
 * **거두는 일은 따로 하지 않는다.** 이 행은 OpenDB 출처라서 적재 앞단의 「이번에
 * 쓰지 않은 OpenDB 행 지우기」가 매번 걷어 낸다. 여기서 다시 세우는 것만 남는다.
 * 사람이 출처와 함께 연도를 넣으면 그 행은 OpenDB 출처가 아니게 되고, 기준도 그
 * 레코드를 고르지 않는다.
 *
 * **`flagConflictingSpecs` 다음에 부른다.** 그쪽의 거두기가 이 행을 건드리지
 * 않도록 제외해 두었지만, 순서까지 맞춰 두면 한쪽 조건을 잃어도 결과가 같다.
 */

import { sql } from 'drizzle-orm';
import type { Database } from '@buildfit/db';
import { implausibleYearSelect } from '@buildfit/db/queries';

export interface ImplausibleYearResult {
  /** 지금 `disputed`가 선 연도 행 수 */
  readonly flagged: number;
}

export async function flagImplausibleYears(db: Database): Promise<ImplausibleYearResult> {
  const result = await db.execute(sql`
    with suspect as (${implausibleYearSelect()})
    insert into part_specs (part_id, key, value, source_url, disputed)
    select x.part_id, 'release_year', to_jsonb(x.year),
           'https://github.com/buildcores/buildcores-open-db/blob/main/open-db/'
             || p.category || '/' || p.opendb_id || '.json',
           true
    from suspect x join parts p on p.id = x.part_id
    where p.opendb_id is not null
    on conflict (part_id, key) do update
      set value = excluded.value, disputed = true, updated_at = now()
      -- 사람이 남긴 행은 덮지 않는다. 기준이 이미 그 레코드를 빼지만 한 번 더 막는다
      where part_specs.source_url like 'https://github.com/buildcores/%'
  `);
  return { flagged: Number(result.count ?? 0) };
}
