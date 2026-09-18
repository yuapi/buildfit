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

    /** 국내 유통 여부. 유효 SKU >= 1 (§5.7.1 7단계) */
    krAvailable: boolean('kr_available'),
    krCheckedAt: timestamp('kr_checked_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('parts_slug_uq').on(t.slug),
    uniqueIndex('parts_opendb_id_uq').on(t.opendbId),
    index('parts_category_idx').on(t.category),
    index('parts_chip_id_idx').on(t.chipId),
    index('parts_mpn_idx').on(t.mpn),
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
