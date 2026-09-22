/**
 * 요구사항 선언(`SPEC_REQUIREMENTS`) ↔ 적재 매핑(`mapping.ts`) 정합성.
 *
 * **이 둘이 갈라지면 규칙이 영구히 판정 불가가 된다.** 규칙이 `PCCase.foo_mm`을
 * 요구하는데 매핑에 `foo_mm`이 없으면 그 열은 카탈로그 전체에서 0건이고, 규칙은
 * 언제나 `unknown`이다. 화면에는 「판정 불가」라고 정직하게 나오므로 **버그처럼
 * 보이지 않는다** — 데이터가 없는 것과 우리가 안 읽는 것을 구별할 수 없다.
 *
 * `build.ts`의 머리 주석이 이미 같은 말을 한다.
 *
 * > 스펙 키 이름은 적재 매핑과 맞아야 한다. 어긋나면 값이 있는데도 결측으로
 * > 읽혀 판정 불가가 된다.
 *
 * 그 말을 지키는 장치가 없었다. 이 테스트가 그 장치다. DB도 OpenDB clone도
 * 필요 없다 — 선언 두 벌을 맞대 보는 정적 검사다.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SPEC_REQUIREMENTS } from '@buildfit/compat';
import { PART_COLUMNS } from '@buildfit/db/queries';
import { describe, expect, it } from 'vitest';
import { CATEGORIES, CATEGORY_SPECS, DERIVED_SPECS } from '../src/mapping';

/** 적재가 이 (카테고리, 키)를 만들어 낼 수 있는가. */
function mapped(category: string, specKey: string): boolean {
  return (
    CATEGORY_SPECS[category]?.[specKey] !== undefined ||
    DERIVED_SPECS[category]?.[specKey] !== undefined
  );
}

/**
 * `parts` 컬럼에 있는 입력은 `CATEGORY_SPECS`에 없다 (이슈 #15).
 *
 * 그 대신 **세 곳이 맞아야 한다** — `transform.ts`가 원본에서 읽고, DB 계층의
 * `PART_COLUMNS`가 컬럼을 알고, 적재가 사람이 넣은 값을 다시 얹는다.
 * 하나라도 빠지면 그 필드가 조용히 100% 결측으로 잡히거나, 어드민이 채운 값이
 * 다음 적재에 사라진다.
 */
const PART_COLUMN_KEYS = new Set(
  SPEC_REQUIREMENTS.filter((r) => r.storedOnPart === true).map((r) => r.specKey),
);

describe('요구사항 선언 ↔ 적재 매핑', () => {
  it.each(
    SPEC_REQUIREMENTS.map(
      (r) =>
        [
          `${r.category}.${r.specKey} (규칙 ${r.ruleId}${r.optional === true ? ', 보조' : ''})`,
          r.category,
          r.specKey,
        ] as const,
    ),
  )('%s 를 적재가 채운다', (_label, category, specKey) => {
    // 컬럼 백업 필드는 아래 별도 테스트가 본다
    if (PART_COLUMN_KEYS.has(specKey)) return;
    expect(
      mapped(category, specKey),
      `규칙이 ${category}.${specKey}를 요구하는데 mapping.ts에 없다. ` +
        `그 열은 카탈로그 전체에서 0건이 되고 규칙은 영구히 판정 불가다.`,
    ).toBe(true);
  });

  it('★ parts 컬럼에 있는 입력은 세 곳이 맞는다 (이슈 #15)', () => {
    const transform = readFileSync(
      fileURLToPath(new URL('../src/transform.ts', import.meta.url)),
      'utf8',
    );
    const index = readFileSync(
      fileURLToPath(new URL('../src/index.ts', import.meta.url)),
      'utf8',
    );

    expect(PART_COLUMN_KEYS.size, '컬럼 백업 필드가 하나도 없다면 이 테스트가 헛돈다').toBeGreaterThan(0);

    for (const key of PART_COLUMN_KEYS) {
      // 1) DB 계층이 컬럼을 안다
      expect(
        Object.keys(PART_COLUMNS),
        `${key}가 PART_COLUMNS에 없다. 결측 집계가 100%로 잡고 어드민이 채울 수 없다`,
      ).toContain(key);

      // 2) 적재가 원본에서 읽는다 (parts 컬럼은 transform이 채운다)
      const camel = key.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
      expect(transform, `transform.ts가 ${key}를 채우지 않는다`).toContain(camel);

      // 3) 적재가 사람이 넣은 값을 다시 얹는다
      expect(
        index,
        `적재가 ${key}를 다시 얹지 않는다. 어드민이 채운 값이 다음 적재에 사라진다`,
      ).toContain(`s.key = '${key}'`);
    }
  });

  it('fallbackKey도 적재가 채운다', () => {
    for (const r of SPEC_REQUIREMENTS) {
      if (r.fallbackKey === undefined) continue;
      if (PART_COLUMN_KEYS.has(r.fallbackKey)) continue;
      expect(
        mapped(r.category, r.fallbackKey),
        `${r.category}.${r.specKey}의 대체 키 ${r.fallbackKey}가 mapping.ts에 없다`,
      ).toBe(true);
    }
  });

  it('요구사항이 가리키는 카테고리를 적재가 읽는다', () => {
    // 매핑에 키가 있어도 `CATEGORIES`에 카테고리가 없으면 그 디렉터리를
    // 아예 훑지 않는다. 부품이 0건이니 규칙도 돌지 않는다.
    for (const category of new Set(SPEC_REQUIREMENTS.map((r) => r.category))) {
      expect(CATEGORIES, `적재가 ${category} 디렉터리를 읽지 않는다`).toContain(category);
    }
  });

  it('매핑 키는 소문자 스네이크 케이스다 — DB 키와 화면 이름표가 이 모양을 가정한다', () => {
    for (const [category, specs] of Object.entries(CATEGORY_SPECS)) {
      for (const key of Object.keys(specs)) {
        expect(key, `${category}.${key}`).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    }
    for (const [category, specs] of Object.entries(DERIVED_SPECS)) {
      for (const key of Object.keys(specs)) {
        expect(key, `${category}.${key} (유도)`).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    }
  });

  it('같은 키를 경로 매핑과 유도 매핑에 둘 다 두지 않는다', () => {
    for (const [category, derived] of Object.entries(DERIVED_SPECS)) {
      for (const key of Object.keys(derived)) {
        expect(
          CATEGORY_SPECS[category]?.[key],
          `${category}.${key}가 경로 매핑에도 있다. 어느 쪽이 이기는지 적재 순서에 달린다`,
        ).toBeUndefined();
      }
    }
  });
});
