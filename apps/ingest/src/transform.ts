/** OpenDB 레코드를 우리 형태로 옮기는 순수 함수들. DB에 의존하지 않는다. */

import { CATEGORY_SPECS, DERIVED_SPECS, POSITIVE_ONLY_KEYS, SPEC_UNITS } from './mapping';

export interface SpecRow {
  readonly key: string;
  readonly value: unknown;
  readonly unit: string | null;
}

export interface PartRow {
  readonly opendbId: string;
  readonly slug: string;
  readonly category: string;
  readonly brand: string | null;
  readonly modelName: string;
  readonly releaseYear: number | null;
  readonly mpn: string | null;
  /** 제조사 스펙 페이지. 어드민 보강의 1차 출처다 (schema.ts 참조) */
  readonly manufacturerUrl: string | null;
  readonly chipsetName: string | null;
  readonly specs: readonly SpecRow[];
  readonly aliases: readonly string[];
}

/**
 * 제조사 URL 정리.
 *
 * http(s)가 아닌 값은 버린다. 이 값은 화면에서 링크가 되므로
 * `javascript:` 같은 스킴을 그대로 통과시키지 않는다.
 * 원본에 앞뒤 공백이 있는 레코드가 실재한다.
 */
export function normalizeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  try {
    const u = new URL(trimmed);
    return u.protocol === 'http:' || u.protocol === 'https:' ? trimmed : null;
  } catch {
    return null;
  }
}

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** `null`·`undefined`·빈 배열·빈 문자열은 결측으로 본다. 0은 값이다. */
export function isFilled(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length === 0 ? false : true;
  return true;
}

/**
 * 출시 연도 검증.
 *
 * OpenDB에 `20117`, `20225` 같은 오타가 실재한다 (조사 §0.2 '범위 밖').
 * 범위를 벗어나면 버린다 — 잘못된 값이 규칙 12의 판정에 쓰이면 안 된다.
 */
export function normalizeReleaseYear(v: unknown, now = new Date()): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v)) return null;
  const max = now.getUTCFullYear() + 2;
  return v >= 1990 && v <= max ? v : null;
}

/** §5.2의 slug 규칙: 소문자, 하이픈, 제조사-모델-변형 */
export function toSlug(parts: readonly (string | null | undefined)[]): string {
  return parts
    .filter((p): p is string => typeof p === 'string' && p.trim() !== '')
    .join(' ')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function firstMpn(record: Record<string, unknown>): string | null {
  const ids = getPath(record, 'identifiers.identifiers');
  if (!Array.isArray(ids)) return null;
  for (const entry of ids) {
    if (entry !== null && typeof entry === 'object') {
      const e = entry as Record<string, unknown>;
      if (e['type'] === 'mpn' && typeof e['value'] === 'string') return e['value'];
    }
  }
  return null;
}

/** OpenDB 레코드 1건 → PartRow. 매핑 대상이 아니거나 이름이 없으면 null. */
export function toPartRow(
  category: string,
  opendbId: string,
  record: Record<string, unknown>,
): PartRow | null {
  const specMap = CATEGORY_SPECS[category];
  if (!specMap) return null;

  const modelName = getPath(record, 'metadata.name');
  if (typeof modelName !== 'string' || modelName.trim() === '') return null;

  const brandRaw = getPath(record, 'metadata.manufacturer');
  const brand = typeof brandRaw === 'string' && brandRaw.trim() !== '' ? brandRaw : null;

  const specs: SpecRow[] = [];
  for (const [key, path] of Object.entries(specMap)) {
    const value = getPath(record, path);
    // 결측은 행을 만들지 않는다. 0·false는 기본적으로 값이므로 남긴다.
    if (!isFilled(value)) continue;
    // 단 0이 물리적으로 불가능한 키는 미입력으로 보고 버린다 (mapping.ts 참조).
    // 커넥터는 여기 해당하지 않는다 — 조합 모순이라 규칙 엔진이 판정한다.
    if (POSITIVE_ONLY_KEYS.has(key) && typeof value === 'number' && value <= 0) continue;
    specs.push({ key, value, unit: SPEC_UNITS[key] ?? null });
  }

  // 경로 하나로 안 되는 스펙. 같은 결측·0 규칙을 그대로 따른다.
  for (const [key, derive] of Object.entries(DERIVED_SPECS[category] ?? {})) {
    const value = derive(record);
    if (!isFilled(value)) continue;
    if (POSITIVE_ONLY_KEYS.has(key) && typeof value === 'number' && value <= 0) continue;
    specs.push({ key, value, unit: SPEC_UNITS[key] ?? null });
  }

  const partNumbers = getPath(record, 'metadata.part_numbers');
  const aliases = new Set<string>();
  aliases.add(modelName);
  if (Array.isArray(partNumbers)) {
    for (const pn of partNumbers) if (typeof pn === 'string' && pn.trim() !== '') aliases.add(pn);
  }

  const chipsetRaw = getPath(record, 'chipset');
  const chipsetName = typeof chipsetRaw === 'string' && chipsetRaw.trim() !== '' ? chipsetRaw : null;

  // 제품명이 이미 제조사로 시작하면 접두어를 겹치지 않는다.
  // "AMD AMD Ryzen 7 9800X3D" 같은 주소가 나오면 검색 유입에 불리하다 (§5.2).
  // 원본에 앞뒤 공백이 실재한다 (" GIGASTONE ..."). 비교 전에 다듬는다.
  const nameStartsWithBrand =
    brand !== null && modelName.trim().toLowerCase().startsWith(brand.trim().toLowerCase());
  // slug는 opendbId 접미사로 고유성을 보장한다. 동일 모델명 중복이 실재한다 (조사 §4)
  const slug = `${toSlug([nameStartsWithBrand ? null : brand, modelName])}-${opendbId.slice(0, 8)}`;

  return {
    opendbId,
    slug,
    category,
    brand,
    modelName,
    releaseYear: normalizeReleaseYear(getPath(record, 'metadata.releaseYear')),
    mpn: firstMpn(record),
    manufacturerUrl: normalizeUrl(getPath(record, 'general_product_information.manufacturer_url')),
    chipsetName,
    specs,
    aliases: [...aliases],
  };
}
