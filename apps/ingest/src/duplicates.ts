/**
 * 같은 제품의 중복 레코드를 묶는다.
 *
 * 원본에 같은 제품이 여러 레코드로 들어 있다 — 이름·제조사·출시연도가 전부 같은
 * 것이 499그룹 1,036건이고 한 그룹이 최대 7건이다. 그대로 두면 검색 한 페이지에
 * 같은 제품이 7번 나오고 구별할 방법이 없다.
 *
 * **합치지 않고 가리킨다.** `parts.id`는 공유 URL이 담으므로(ADR-0012) 레코드를
 * 없애면 이미 뿌려진 링크가 깨진다.
 *
 * 근거: `docs/research/duplicate-parts.md`
 */

import { sql } from 'drizzle-orm';
import type { Database } from '@buildfit/db';

export interface DuplicateResult {
  /** 대표가 아닌 것으로 표시된 레코드 수 */
  readonly marked: number;
  /** 중복 그룹 수 */
  readonly groups: number;
  /** 값이 어긋나 `disputed`가 선 (부품, 키) 수 */
  readonly disputed: number;
}

/**
 * 같은 제품을 묶는 키.
 *
 * 이름(공백 접기·소문자) + 제조사 + 출시연도. 셋이 다 같으면 화면에서 구별할
 * 방법이 없으므로 같은 제품으로 본다. 브랜드·연도를 빼도 그룹 수가 516 → 499로
 * 거의 같지만, **다른 제품을 묶는 쪽이 더 나쁘므로** 좁게 잡는다.
 */
const GROUP_KEY = sql`(
  p.category,
  lower(btrim(regexp_replace(p.model_name, '\\s+', ' ', 'g'))),
  coalesce(p.brand, ''),
  coalesce(p.release_year, -1)
)`;

/**
 * 대표를 고르고 나머지에 `duplicate_of`를 세운다.
 *
 * **대표는 `opendb_id` 사전순 최솟값이다.** 같은 입력에 같은 답이 나와야 한다 —
 * 재적재마다 대표가 바뀌면 목록이 흔들리고 `rel=canonical`이 오간다. `opendb_id`는
 * 원본이 주는 값이고 적재 순서에 좌우되지 않는다.
 *
 * 매번 전부 다시 계산한다. 업스트림이 중복을 정리하면 `duplicate_of`가 풀려야
 * 하는데, 세우기만 하면 한 번 붙은 표시가 영영 남는다.
 */
export async function markDuplicates(db: Database): Promise<DuplicateResult> {
  await db.execute(sql`update parts set duplicate_of = null where duplicate_of is not null`);

  const marked = await db.execute(sql`
    with ranked as (
      select p.id,
        first_value(p.id) over (
          partition by ${GROUP_KEY}
          order by p.opendb_id nulls last, p.id
        ) as canonical
      from parts p
    )
    update parts t
    set duplicate_of = r.canonical
    from ranked r
    where t.id = r.id and r.canonical <> t.id
  `);

  const [groups] = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from (
      select 1 from parts p group by ${GROUP_KEY} having count(*) > 1
    ) g
  `);

  return {
    marked: Number(marked.count ?? 0),
    groups: Number(groups?.n ?? 0),
    disputed: 0,
  };
}

/**
 * 중복 그룹 안에서 **값이 어긋나는** 스펙에 `disputed`를 세운다.
 *
 * 같은 제품이면 스펙도 같아야 한다. 어긋나면 하나는 틀린 값이다 — 추측이 필요
 * 없는 검증 신호다. 4,366쌍 중 127쌍(2.91%)이 여기 걸리고 **규칙 8의 입력 세
 * 개가 포함된다.**
 *
 * `disputed`는 컬럼과 「검증 중」 표시가 이미 있고(§5.5) 지금까지 0건이었다.
 * 어드민이 바로 볼 수 있는 작업 목록이 된다.
 *
 * **사람이 신고해 세운 것을 지우지 않는다.** 세우기만 한다 — 어느 쪽이 세웠는지
 * 구분할 방법이 없어서다. 어드민이 값을 채우면 그때 풀린다.
 *
 * **`markDuplicates` 다음에 부른다.** `duplicate_of`를 그룹으로 쓴다.
 */
export interface ConflictResult {
  /** 이번에 새로 세운 행 수 */
  readonly marked: number;
  /** 지금 서 있는 행 수. 두 번째 적재부터 `marked`는 0이 된다 */
  readonly standing: number;
}

export async function flagConflictingSpecs(db: Database): Promise<ConflictResult> {
  const result = await db.execute(sql`
    with grp as (
      -- ★ markDuplicates가 계산해 둔 답을 쓴다. 여기서 GROUP_KEY로 다시 묶으면
      -- 기준이 두 벌이 되고, 한쪽만 고치는 날 조용히 어긋난다.
      -- 어드민 목록(conflictingSpecs)도 같은 식을 쓴다.
      select id, coalesce(duplicate_of, id) as canon from parts
    ), conflicting as (
      select g.canon, s.key
      from grp g join part_specs s on s.part_id = g.id
      group by g.canon, s.key
      having count(distinct s.value::text) > 1
    )
    update part_specs s
    set disputed = true
    from grp g, conflicting c
    where s.part_id = g.id and g.canon = c.canon and s.key = c.key and s.disputed = false
  `);

  // 서 있는 총수를 따로 센다. 두 번째 적재부터 위 update는 0행이고, 로그에
  // 0만 찍히면 "어긋난 값이 없다"로 읽힌다 — 실제로는 274행이 서 있다.
  const [total] = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from part_specs where disputed`,
  );

  return { marked: Number(result.count ?? 0), standing: Number(total?.n ?? 0) };
}
