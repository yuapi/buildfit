/**
 * PostgreSQL 스키마 — Phase 0a.
 *
 * 설계 근거: `pc-builder-spec.md` §5.8, ADR-0003(parts/skus 분리), ADR-0011(Drizzle)
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

    /** 국내 유통 여부. 유효 SKU >= 1 (§5.7.1 7단계) */
    krAvailable: boolean('kr_available'),
    krCheckedAt: timestamp('kr_checked_at', { withTimezone: true }),

    /**
     * 검색용 평탄화 이름 — ADR-0017. **생성 컬럼이다. 쓰지 않는다.**
     *
     * 이름·브랜드·파트넘버를 이어 붙이고 영문 소문자와 숫자만 남긴다.
     * 띄어쓰기와 하이픈이 사라지므로 `rtx 4070`과 `rtx4070`이 같은 모양이 된다.
     * 실측으로 `rtx4070`은 0건이었고 `rtx 4070`은 273건이었다 — 같은 것을 찾는
     * 두 표기였다.
     *
     * **`@buildfit/compat`의 `squash()`와 글자 하나까지 같아야 한다.**
     * 어긋나면 검색이 조용히 빗나간다. 테스트가 두 정의를 함께 고정한다.
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

/** 표기 변형. §7 가격 정규화의 입력이자 검색 유입용 URL의 근거 (§5.2) */
export const partAliases = pgTable(
  'part_aliases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partId: uuid('part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'cascade' }),
    rawName: text('raw_name').notNull(),
    /** 0~1. 임계 이하면 자동 매핑하지 않고 검토 큐로 (§7.3) */
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
 * 국내 수입사(총판).
 *
 * 시드는 `docs/research/kr-distributor-dictionary.md`. 미검증 항목은 `confidence`로
 * 구분해 적재한다.
 */
export const importers = pgTable(
  'importers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    /** 상품명 접미사 매칭에 쓰는 표기 변형 전부 */
    aliasesJson: jsonb('aliases_json').notNull().default(sql`'[]'::jsonb`),
    supportUrl: text('support_url'),
    note: text('note'),
    /** seed | verified. 검증 전 항목을 매칭 로직에서 구분하기 위한 것 */
    confidence: text('confidence').notNull().default('seed'),
    sourceUrl: text('source_url'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('importers_name_uq').on(t.name)],
);

/**
 * 국내 유통 단위. 화면 표시와 구매 판단은 여기서 한다 (ADR-0003).
 *
 * `importerId`가 NULL이어도 된다. 총판을 식별하지 못해도 SKU는 생성한다 (§3.2).
 */
export const skus = pgTable(
  'skus',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partId: uuid('part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'cascade' }),
    importerId: uuid('importer_id').references(() => importers.id),
    /** 결과 화면에 쓰는 국내 상품명 */
    displayNameKo: text('display_name_ko').notNull(),
    gtin: text('gtin'),
    mallProductId: text('mall_product_id'),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    /** 연속 N회 조회에서 사라지면 단종 후보. 즉시 내리지 않는다 (§5.7.1) */
    active: boolean('active').notNull().default(true),
  },
  (t) => [
    index('skus_part_id_idx').on(t.partId),
    index('skus_importer_id_idx').on(t.importerId),
    uniqueIndex('skus_mall_product_uq').on(t.mallProductId),
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
