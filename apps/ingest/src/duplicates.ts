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
import { comparableSpecValue } from '@buildfit/db/queries';

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
 * **사람이 신고해 세운 것을 지우지 않는다.** 이 검사가 세운 것 중 더는 어긋나지
 * 않는 것만 거둔다 — 구분은 「열린 신고가 있는가」로 한다 (아래 주석).
 *
 * **`markDuplicates` 다음에 부른다.** `duplicate_of`를 그룹으로 쓴다.
 */
export interface ConflictResult {
  /** 이번에 새로 세운 행 수 */
  readonly marked: number;
  /**
   * 이번에 거둔 행 수 — 이 검사가 세웠는데 **더는 어긋나지 않는** 것.
   *
   * 사람이 신고해 세운 것은 거두지 않는다 (아래 `retractStale` 주석).
   */
  readonly retracted: number;
  /** 지금 서 있는 행 수. 두 번째 적재부터 `marked`는 0이 된다 */
  readonly standing: number;
}

export async function flagConflictingSpecs(db: Database): Promise<ConflictResult> {
  // 비교는 **같은 소켓의 다른 표기를 같은 값으로 센다** (이슈 #16). 어드민 목록
  // (conflictingSpecs)과 같은 식이다 — 두 벌이면 「검증 중」과 목록이 갈라진다.
  const value = comparableSpecValue('s');

  const conflicting = sql`
    grp as (
      -- ★ markDuplicates가 계산해 둔 답을 쓴다. 여기서 GROUP_KEY로 다시 묶으면
      -- 기준이 두 벌이 되고, 한쪽만 고치는 날 조용히 어긋난다.
      select id, coalesce(duplicate_of, id) as canon from parts
    ), conflicting as (
      select g.canon, s.key
      from grp g join part_specs s on s.part_id = g.id
      group by g.canon, s.key
      having count(distinct ${value}) > 1
    )`;

  const result = await db.execute(sql`
    with ${conflicting}
    update part_specs s
    set disputed = true
    from grp g, conflicting c
    where s.part_id = g.id and g.canon = c.canon and s.key = c.key and s.disputed = false
  `);

  /**
   * ★ 이 검사가 세운 것 중 더는 어긋나지 않는 것을 거둔다.
   *
   * 전에는 세우기만 했다 — 사람이 신고해 세운 것과 구분할 방법이 없어서였다.
   * 그런데 **구분할 수단이 있었다.** `disputed`를 세우는 곳은 둘뿐이다:
   *
   * 1. 사용자 신고(`createSpecReport`) — 항상 `spec_reports`에 **열린 신고**가 같이 생긴다
   * 2. 이 검사
   *
   * 그러니 **열린 신고가 없는 `disputed`는 이 검사가 세운 것이다.** 그중 지금은
   * 어긋나지 않는 것만 거둔다. 열린 신고가 있으면 절대 건드리지 않는다.
   *
   * 거두지 않으면 표기가 정리되거나(TR4/sTR4, 이슈 #16) 업스트림이 값을 고쳐도
   * 「검증 중」이 영원히 남고, 판정마다 「검증 중인 값으로 판정했습니다」가 붙는다.
   */
  const retracted = await db.execute(sql`
    with ${conflicting}
    update part_specs s
    set disputed = false
    from grp g
    where s.part_id = g.id
      and s.disputed = true
      and not exists (select 1 from conflicting c where c.canon = g.canon and c.key = s.key)
      and not exists (
        select 1 from spec_reports r
        where r.part_id = s.part_id and r.spec_key = s.key and r.status = 'open'
      )
  `);

  // 서 있는 총수를 따로 센다. 두 번째 적재부터 위 update는 0행이고, 로그에
  // 0만 찍히면 "어긋난 값이 없다"로 읽힌다 — 실제로는 274행이 서 있다.
  const [total] = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from part_specs where disputed`,
  );

  return {
    marked: Number(result.count ?? 0),
    retracted: Number(retracted.count ?? 0),
    standing: Number(total?.n ?? 0),
  };
}
