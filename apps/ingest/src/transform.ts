/** OpenDB 레코드를 우리 형태로 옮기는 순수 함수들. DB에 의존하지 않는다. */

import { CATEGORY_SPECS, SPEC_UNITS } from './mapping';

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
  readonly chipsetName: string | null;
  readonly specs: readonly SpecRow[];
  readonly aliases: readonly string[];
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
    // 결측은 행을 만들지 않는다. 0·false는 값이므로 남긴다.
    if (!isFilled(value)) continue;
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

  // slug는 opendbId 접미사로 고유성을 보장한다. 동일 모델명 중복이 실재한다 (조사 §4)
  const slug = `${toSlug([brand, modelName])}-${opendbId.slice(0, 8)}`;

  return {
    opendbId,
    slug,
    category,
    brand,
    modelName,
    releaseYear: normalizeReleaseYear(getPath(record, 'metadata.releaseYear')),
    mpn: firstMpn(record),
    chipsetName,
    specs,
    aliases: [...aliases],
  };
}
