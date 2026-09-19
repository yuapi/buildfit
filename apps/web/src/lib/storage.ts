/**
 * 브라우저 로컬 저장 — `pc-builder-spec.md` §8A, ADR-0005.
 *
 * **서버는 롤백되지만 사용자 브라우저는 롤백되지 않는다.** 배포를 되돌려도 구버전
 * 코드가 신버전 데이터를 읽게 된다. 그래서 저장 포맷은 add-only이고, 읽기는
 * 관대해야 한다.
 *
 * 저장하는 것은 부품 id가 아니라 **공유 코드**다. 견적의 정본이 URL이므로(§8A.3)
 * 코드만 있으면 복원되고, 저장 목록이 날아가도 링크로 되살릴 수 있다.
 */

import { decodeBuildCode } from './build-code';

/** 저장 포맷 버전. 올릴 때는 ADR-0005에 따라 T2(승인 필수)다. */
export const STORAGE_SCHEMA_VERSION = 1;

/** 새로 쓰는 레코드에 찍는 버전. */
export const RECORD_VERSION = 1;

export const STORAGE_KEYS = {
  builds: 'builds',
  recentBuilds: 'recent_builds',
  recentParts: 'recent_parts',
  prefs: 'prefs',
  schemaVersion: 'schema_version',
} as const;

/** §8A.1의 상한. 초과하면 오래된 것부터 버린다 (LRU). */
export const LIMITS = { builds: 20, recentBuilds: 5, recentParts: 20 } as const;

export interface SavedBuild {
  readonly v: number;
  /** 공유 URL 코드. 이것이 견적의 정본이다 (§8A.3) */
  readonly code: string;
  readonly label: string;
  readonly savedAt: string;
}

export interface RecentPart {
  readonly v: number;
  readonly id: string;
  readonly category: string;
  readonly name: string;
  readonly at: string;
}

// --- 저장소 접근 ------------------------------------------------------------

function store(): Storage | null {
  // SSR에서는 없다. 시크릿 모드·차단 설정에서는 접근 자체가 던질 수 있다.
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 이 브라우저에서 저장이 되는가. 안내 문구를 고르는 데 쓴다 (§8A.4). */
export function isStorageAvailable(): boolean {
  const s = store();
  if (!s) return false;
  try {
    const probe = '__buildfit_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function readList(key: string): unknown[] {
  try {
    const raw = store()?.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // 파싱 실패는 조용히 폐기한다. 앱은 계속 동작해야 한다 (§8A.2 규칙 4).
    return [];
  }
}

/** 쓰기 실패를 정상 경로로 처리한다. 성공 여부를 돌려준다 (§8A.4). */
function writeList(key: string, value: unknown[]): boolean {
  try {
    const s = store();
    if (!s) return false;
    s.setItem(key, JSON.stringify(value));
    s.setItem(STORAGE_KEYS.schemaVersion, String(STORAGE_SCHEMA_VERSION));
    return true;
  } catch {
    return false;
  }
}

// --- 마이그레이션 -----------------------------------------------------------

function asRecord(raw: unknown): Record<string, unknown> | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

function str(o: Record<string, unknown>, key: string): string | null {
  const v = o[key];
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

/**
 * 저장된 견적 1건을 현재 형태로 읽는다. 복구 불가면 `null`.
 *
 * **버전이 더 높아도 거부하지 않는다.** 포맷이 add-only라 필수 필드는 그대로
 * 남아 있고, 모르는 필드는 무시하면 된다 (§8A.2 규칙 2). 롤백으로 구버전 코드가
 * 신버전 데이터를 만나는 상황이 정상 경로다.
 */
export function migrateSavedBuild(raw: unknown): SavedBuild | null {
  const o = asRecord(raw);
  if (!o) return null;

  const code = str(o, 'code');
  if (!code) return null;
  // 코드가 실제로 읽히는지까지 확인한다. 깨진 코드를 목록에 남겨두면
  // 사용자가 눌렀을 때 죽은 링크를 만난다.
  if (!decodeBuildCode(code)) return null;

  const v = typeof o['v'] === 'number' ? o['v'] : RECORD_VERSION;
  return {
    v,
    code,
    label: str(o, 'label') ?? '이름 없는 견적',
    savedAt: str(o, 'savedAt') ?? new Date(0).toISOString(),
  };
}

export function migrateRecentPart(raw: unknown): RecentPart | null {
  const o = asRecord(raw);
  if (!o) return null;
  const id = str(o, 'id');
  const category = str(o, 'category');
  if (!id || !category) return null;
  return {
    v: typeof o['v'] === 'number' ? o['v'] : RECORD_VERSION,
    id,
    category,
    name: str(o, 'name') ?? id,
    at: str(o, 'at') ?? new Date(0).toISOString(),
  };
}

// --- 저장한 견적 ------------------------------------------------------------

export function loadBuilds(): SavedBuild[] {
  return readList(STORAGE_KEYS.builds)
    .map(migrateSavedBuild)
    .filter((b): b is SavedBuild => b !== null);
}

/** 같은 코드가 이미 있으면 위로 올리고 이름만 갱신한다. */
export function saveBuild(code: string, label: string): boolean {
  if (!decodeBuildCode(code)) return false;
  const rest = loadBuilds().filter((b) => b.code !== code);
  const next: SavedBuild[] = [
    { v: RECORD_VERSION, code, label: label.trim() || '이름 없는 견적', savedAt: new Date().toISOString() },
    ...rest,
  ].slice(0, LIMITS.builds);
  const ok = writeList(STORAGE_KEYS.builds, next);
  invalidate();
  return ok;
}

export function removeBuild(code: string): boolean {
  const ok = writeList(
    STORAGE_KEYS.builds,
    loadBuilds().filter((b) => b.code !== code),
  );
  invalidate();
  return ok;
}

// --- 최근 구성한 견적 (자동) -------------------------------------------------

export function loadRecentBuilds(): SavedBuild[] {
  return readList(STORAGE_KEYS.recentBuilds)
    .map(migrateSavedBuild)
    .filter((b): b is SavedBuild => b !== null);
}

export function recordRecentBuild(code: string, label: string): boolean {
  if (!decodeBuildCode(code)) return false;
  const rest = loadRecentBuilds().filter((b) => b.code !== code);
  const next: SavedBuild[] = [
    { v: RECORD_VERSION, code, label, savedAt: new Date().toISOString() },
    ...rest,
  ].slice(0, LIMITS.recentBuilds);
  const ok = writeList(STORAGE_KEYS.recentBuilds, next);
  invalidate();
  return ok;
}

// --- 최근 조회한 부품 --------------------------------------------------------

export function loadRecentParts(): RecentPart[] {
  return readList(STORAGE_KEYS.recentParts)
    .map(migrateRecentPart)
    .filter((p): p is RecentPart => p !== null);
}

export function recordRecentPart(part: { id: string; category: string; name: string }): boolean {
  const rest = loadRecentParts().filter((p) => p.id !== part.id);
  const next: RecentPart[] = [
    { v: RECORD_VERSION, ...part, at: new Date().toISOString() },
    ...rest,
  ].slice(0, LIMITS.recentParts);
  const ok = writeList(STORAGE_KEYS.recentParts, next);
  invalidate();
  return ok;
}

// --- React 연동 --------------------------------------------------------------

/**
 * localStorage는 React 바깥의 스토어다. `useSyncExternalStore`로 읽는다.
 *
 * effect에서 setState로 끌어오면 마운트마다 연쇄 렌더가 나고, 서버 렌더와
 * 어긋나 hydration 불일치가 생긴다. 스냅샷을 캐시해 참조를 안정시키고,
 * 쓰기가 일어날 때만 무효화한다.
 */
export interface StorageSnapshot {
  readonly available: boolean;
  readonly builds: readonly SavedBuild[];
  readonly recentBuilds: readonly SavedBuild[];
}

/** 서버에는 저장소가 없다. 항상 같은 참조를 돌려줘야 한다. */
const SERVER_SNAPSHOT: StorageSnapshot = { available: false, builds: [], recentBuilds: [] };

let snapshot: StorageSnapshot | null = null;
const listeners = new Set<() => void>();

function invalidate(): void {
  snapshot = null;
  for (const notify of listeners) notify();
}

export function subscribeStorage(notify: () => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

export function getStorageSnapshot(): StorageSnapshot {
  snapshot ??= {
    available: isStorageAvailable(),
    builds: loadBuilds(),
    recentBuilds: loadRecentBuilds(),
  };
  return snapshot;
}

export function getServerStorageSnapshot(): StorageSnapshot {
  return SERVER_SNAPSHOT;
}

/** 테스트에서 캐시를 비운다. */
export function resetStorageSnapshot(): void {
  snapshot = null;
}
