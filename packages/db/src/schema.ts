/**
 * PostgreSQL 스키마 — Phase 0a.
 *
 * 설계 근거: `pc-builder-spec.md` §5.8, ADR-0011(Drizzle). `skus`·`importers`는 폐기 (ADR-0022)
 *
 * **스키마 변경은 expand-contract를 따른다** (`autonomous-pipeline-plan.md` §7.1).
 * 컬럼 추가는 add-only라 T0, DROP·ALTER COLUMN·NOT NULL 추가는 T2다.
 * 마이그레이션 SQL이 그 판정의 입력이므로 반드시 커밋한다.
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * 글로벌 부품. 호환성 판정의 근거는 전부 여기서 나온다 (ADR-0003).
 *
 * 카테고리를 enum이 아니라 text로 둔 이유는 §5.8과 같다 — 부품 종류를 늘릴 때마다
 * 스키마 마이그레이션을 하지 않기 위해서다. 유효값 검증은 적재 계층에서 한다.
 */
export const parts = pgTable(
  'parts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** canonical slug. 소문자-하이픈-제조사-모델-변형 (§5.2) */
    slug: text('slug').notNull(),
    /** OpenDB 디렉터리명 기준: CPU, Motherboard, RAM, GPU, PCCase, PSU, CPUCooler, Storage */
    category: text('category').notNull(),
    brand: text('brand'),
    modelName: text('model_name').notNull(),

    /**
     * 출시 연도.
     *
     * 스펙 §5.8 초안은 `release_date`(날짜)였으나 1차 소스가 **연 단위만** 제공한다
     * (`docs/research/opendb-schema-analysis.md` §7.4). 있지도 않은 정밀도를 스키마로
     * 주장하지 않는다. 제조사 스펙시트로 정확한 날짜를 확보하게 되면 그때
     * `release_date`를 **추가**한다 (add-only, T0).
     */
    releaseYear: integer('release_year'),

    /** 단종. 지우지 않는다 — 업그레이드 진단에서 기존 부품으로 선택된다 (§5.6) */
    discontinued: boolean('discontinued').notNull().default(false),

    /**
     * GPU AIB 모델이 참조하는 기준 칩.
     *
     * OpenDB에는 칩 레벨 레코드가 따로 없고 `chipset` 문자열만 있으므로,
     * 적재 시 chipset으로 그룹핑해 칩 레코드를 만들고 여기서 참조한다 (§5.8, 조사 §7.3).
     */
    chipId: uuid('chip_id'),

    /** OpenDB 원본 레코드 id. 재동기화의 매칭 키 */
    opendbId: text('opendb_id'),
    /** 제조사 파트넘버. 조사 결과 전 카테고리 99% 충전 — 국내 매칭의 우선 키 (조사 §7.6) */
    mpn: text('mpn'),

    /**
     * 제조사 스펙 페이지 URL. OpenDB `general_product_information.manufacturer_url`.
     *
     * 판정에는 쓰지 않는다. **어드민 보강의 1차 출처**다 (§5.3, §5.5).
     * 빈 필드를 채우려면 출처를 찾는 데 대부분의 시간이 드는데, 이 값이 있으면
     * 그 단계가 사라진다. 채움률은 카테고리마다 다르다 (CPU 83%, 케이스 22%, PSU 3%).
     */
    manufacturerUrl: text('manufacturer_url'),

    /**
     * 같은 제품의 **대표 레코드**. 대표 자신은 `null`이다.
     *
     * 원본에 같은 제품이 여러 레코드로 들어 있다 — 이름·제조사·출시연도가 전부
     * 같은 것이 499그룹 1,036건이고, 한 그룹이 최대 7건이다. 그대로 두면 검색
     * 한 페이지에 같은 제품이 7번 나오고 구별할 방법이 없다.
     *
     * **합치지 않고 가리킨다.** `parts.id`는 공유 URL이 담으므로(ADR-0012)
     * 레코드를 없애면 이미 뿌려진 링크가 깨진다. 목록·검색·sitemap만 대표를
     * 보여주고, id로는 여전히 열린다.
     *
     * 근거: `docs/research/duplicate-parts.md`
     */
    duplicateOf: uuid('duplicate_of'),

    /**
     * 검색용 평탄화 이름 — ADR-0017. **생성 컬럼이다. 쓰지 않는다.**
     *
     * 이름·브랜드·파트넘버를 이어 붙이고 영문 소문자와 숫자만 남긴다.
     * 띄어쓰기와 하이픈이 사라지므로 `rtx 4070`과 `rtx4070`이 같은 모양이 된다.
     * 실측으로 `rtx4070`은 0건이었고 `rtx 4070`은 273건이었다 — 같은 것을 찾는
     * 두 표기였다.
     *
     * **`@buildfit/compat`의 `squash()`와 글자 하나까지 같아야 한다.**
     * 어긋나면 검색이 조용히 빗나간다. 테스트가 두 정의를 함께 고정한다
     * (`apps/ingest/test/search-sql.test.ts`).
     *
     * 한 가지가 **DB 로케일에 달려 있다.** `İ`(U+0130)와 켈빈 기호 `K`(U+212A)는
     * 보통의 UTF-8·ICU 로케일에서 PG도 `i`·`k`로 낮추지만, 클러스터가
     * `C`/`POSIX`면 그대로 남아 필터에 지워진다. 그 둘이 두 정의가 갈릴 수 있는
     * 전부이고, 테스트 픽스처가 그 둘을 포함한다.
     */
    searchText: text('search_text').generatedAlwaysAs(
      sql`regexp_replace(lower(model_name || ' ' || coalesce(brand, '') || ' ' || coalesce(mpn, '')), '[^a-z0-9]', '', 'g')`,
    ),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('parts_slug_uq').on(t.slug),
    uniqueIndex('parts_opendb_id_uq').on(t.opendbId),
    index('parts_category_idx').on(t.category),
    // 목록·검색이 매번 「대표만」으로 좁힌다. 대표가 97.9%라 부분 인덱스로 둔다
    index('parts_duplicate_of_idx').on(t.duplicateOf).where(sql`${t.duplicateOf} is not null`),
    index('parts_chip_id_idx').on(t.chipId),
    index('parts_mpn_idx').on(t.mpn),
    // 부분 일치라 b-tree가 듣지 않는다. 앞에 와일드카드가 붙으면 b-tree는
    // 훑기로 떨어진다 — GPU 카테고리에서 192ms였다. trigram으로 3.5ms.
    index('parts_search_text_trgm_idx').using('gin', t.searchText.op('gin_trgm_ops')),
  ],
);

/**
 * 부품 스펙. key-value인 이유는 카테고리마다 항목이 완전히 달라서다 (§5.8).
 *
 * **모든 값에 `source_url`과 `verified_at`을 둔다** (§5.5). 재검증할 때 출처가 없으면
 * 처음부터 다시 해야 한다.
 */
export const partSpecs = pgTable(
  'part_specs',
  {
    partId: uuid('part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'cascade' }),
    /** 정규화된 스펙 키. 예: socket, length_mm, pcie_8_pin */
    key: text('key').notNull(),
    /** 값. 타입이 제각각이라 JSONB로 둔다 */
    value: jsonb('value'),
    unit: text('unit'),
    sourceUrl: text('source_url'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    /** 사용자 신고가 들어온 필드. 결과 화면에 "검증 중"으로 표시한다 (§5.5) */
    disputed: boolean('disputed').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.partId, t.key] }),
    index('part_specs_key_idx').on(t.key),
    index('part_specs_disputed_idx').on(t.disputed).where(sql`${t.disputed}`),
  ],
);

/** 표기 변형. 검색 유입용 URL의 근거 (§5.2) */
export const partAliases = pgTable(
  'part_aliases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partId: uuid('part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'cascade' }),
    rawName: text('raw_name').notNull(),
    /** 0~1. 가격 정규화(§7)가 쓰려던 칸이다 — 폐기됐고(ADR-0022) 적재는 채우지 않는다 */
    confidence: numeric('confidence', { precision: 4, scale: 3 }),
    source: text('source'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('part_aliases_part_raw_uq').on(t.partId, t.rawName),
    index('part_aliases_raw_name_idx').on(t.rawName),
  ],
);

/**
 * 스펙 오류 신고 — `pc-builder-spec.md` §5.5.
 *
 * > 각 부품 페이지에 **오류 신고 버튼.** 사용자 제보가 가장 값싼 검증 수단이다.
 * > 신고가 들어오면 해당 필드에 `disputed` 플래그를 세우고, 결과 화면에 "검증 중" 표시
 *
 * 로그인이 없으므로(ADR-0001) 신고자를 식별하지 않는다. 브라우저 단위 중복 방지만
 * 한다 (§6.6.5와 같은 방식).
 */
export const specReports = pgTable(
  'spec_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partId: uuid('part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'cascade' }),
    /** 신고 대상 스펙 키. 값이 아예 없는 필드를 신고할 수도 있다. */
    specKey: text('spec_key').notNull(),
    /** 사용자가 맞다고 생각하는 값. 비워둘 수 있다. */
    reportedValue: text('reported_value'),
    note: text('note'),
    /** 브라우저 단위 중복 방지용. 개인 식별에 쓰지 않는다. */
    clientToken: text('client_token'),
    /** open | resolved | rejected */
    status: text('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('spec_reports_part_idx').on(t.partId),
    index('spec_reports_status_idx').on(t.status),
    uniqueIndex('spec_reports_dedupe_uq').on(t.partId, t.specKey, t.clientToken),
  ],
);

/**
 * 부품별 성능 측정값 — ADR-0023, 명세 §6.9.
 *
 * **측정값이다. 추정·예측이 아니다.** 한 줄이 한 부품의 한 용도 축이다
 * (`render.blender` = 3D 렌더링). 축을 합치지 않는다 (ADR-0004).
 *
 * GPU는 칩 단위로 측정된다. 같은 칩의 모든 부품이 같은 값을 받고, 그 사실을
 * `per_chip`이 말한다 — 화면이 「칩 기준 측정」이라고 적는다.
 */
export const partBenchmarks = pgTable(
  'part_benchmarks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partId: uuid('part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'cascade' }),
    /** 용도 축. 지금은 `render.blender` 하나 */
    axis: text('axis').notNull(),
    /** 중앙값 */
    value: numeric('value', { precision: 12, scale: 2 }).notNull(),
    unit: text('unit').notNull(),
    /** 중앙값을 낸 실행 수. 화면에 함께 낸다 */
    runs: integer('runs').notNull(),
    /** 출처가 기록한 장치 이름 그대로. 맞춘 것이 맞는지 사용자가 확인하게 한다 */
    deviceName: text('device_name').notNull(),
    /** GPU 연산 방식 (`OPTIX` · `HIP` · `ONEAPI` · `CPU`) */
    backend: text('backend').notNull(),
    /** 측정한 소프트웨어 버전 (`4.5`). 버전마다 점수가 다르다 */
    measuredVersion: text('measured_version').notNull(),
    /** 칩 단위 측정이라 같은 칩의 다른 제품도 같은 값을 받는가 */
    perChip: boolean('per_chip').notNull().default(false),
    sourceUrl: text('source_url').notNull(),
    /** 출처 스냅숏 날짜 */
    snapshotDate: text('snapshot_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('part_benchmarks_part_axis_uq').on(t.partId, t.axis)],
);
