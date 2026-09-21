/**
 * 로컬 저장 — §8A, ADR-0005.
 *
 * 핵심은 **구버전 코드가 신버전 데이터를 만나도 깨지지 않는다**는 것이다.
 * 서버는 롤백되지만 사용자 브라우저는 롤백되지 않는다.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LIMITS,
  STORAGE_KEYS,
  loadBuilds,
  loadRecentBuilds,
  loadRecentParts,
  isStorageAvailable,
  clearDraft,
  loadDraft,
  migrateSavedBuild,
  recordRecentBuild,
  saveDraft,
  recordRecentPart,
  removeBuild,
  saveBuild,
  getServerStorageSnapshot,
  getStorageSnapshot,
  resetStorageSnapshot,
  subscribeStorage,
} from '../src/lib/storage';

const CODE = 'AQMRERERERFBEYERERERERERIiIiIiIiQiKCIiIiIiIiIg';

/** 브라우저 localStorage 흉내. 실패 주입도 할 수 있어야 한다. */
function installStorage(opts: { failWrites?: boolean; throwOnAccess?: boolean } = {}) {
  const data = new Map<string, string>();
  const mock = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (opts.failWrites) throw new DOMException('QuotaExceededError');
      data.set(k, v);
    },
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
  vi.stubGlobal('window', {
    get localStorage() {
      if (opts.throwOnAccess) throw new DOMException('SecurityError');
      return mock;
    },
  });
  return data;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  resetStorageSnapshot();
});

describe('★ 버전별 샘플 복원 (§10.4)', () => {
  const dir = join(import.meta.dirname, 'fixtures', 'storage');
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

  it('샘플이 최소 하나는 보관돼 있다', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s 의 저장 내용이 전부 복원된다', (file) => {
    const data = installStorage();
    const raw = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Record<string, string>;
    for (const [k, v] of Object.entries(raw)) data.set(k, v);

    const builds = loadBuilds();
    expect(builds.length).toBeGreaterThan(0);
    expect(builds[0]?.code).toBeTruthy();
    expect(builds[0]?.label).toBeTruthy();

    expect(loadRecentBuilds().length).toBeGreaterThan(0);
    expect(loadRecentParts().length).toBeGreaterThan(0);
  });
});

describe('읽기는 관대하게 (§8A.2 규칙 2)', () => {
  it('★ 더 높은 버전의 레코드도 읽는다 — 롤백 시 정상 경로다', () => {
    const rec = migrateSavedBuild({ v: 99, code: CODE, label: 'v99에서 저장', savedAt: 'x' });
    expect(rec?.code).toBe(CODE);
    expect(rec?.v).toBe(99);
  });

  it('모르는 필드는 무시한다', () => {
    const rec = migrateSavedBuild({ v: 2, code: CODE, label: 'ok', savedAt: 'x', future: { a: 1 } });
    expect(rec?.label).toBe('ok');
  });

  it('없는 필드는 기본값으로 채운다', () => {
    const rec = migrateSavedBuild({ code: CODE });
    expect(rec?.label).toBe('이름 없는 견적');
    expect(rec?.savedAt).toBeTruthy();
  });

  it('코드가 없으면 복구 불가', () => {
    expect(migrateSavedBuild({ v: 1, label: 'x' })).toBeNull();
  });

  it('코드가 깨졌으면 복구 불가 — 죽은 링크를 목록에 남기지 않는다', () => {
    expect(migrateSavedBuild({ v: 1, code: '!!broken!!' })).toBeNull();
  });
});

describe('파싱 실패는 조용히 폐기 (§8A.2 규칙 4)', () => {
  it('JSON이 깨져도 빈 목록을 주고 던지지 않는다', () => {
    const data = installStorage();
    data.set(STORAGE_KEYS.builds, '{이건 JSON이 아니다');
    expect(loadBuilds()).toEqual([]);
  });

  it('배열이 아니면 빈 목록', () => {
    const data = installStorage();
    data.set(STORAGE_KEYS.builds, '{"a":1}');
    expect(loadBuilds()).toEqual([]);
  });

  it('★ 깨진 항목만 버리고 나머지는 살린다', () => {
    const data = installStorage();
    data.set(
      STORAGE_KEYS.builds,
      JSON.stringify([
        { v: 1, code: CODE, label: '멀쩡함', savedAt: 'x' },
        null,
        'string',
        { v: 1, label: '코드 없음' },
        { v: 1, code: '!!broken!!' },
      ]),
    );
    const builds = loadBuilds();
    expect(builds).toHaveLength(1);
    expect(builds[0]?.label).toBe('멀쩡함');
  });
});

describe('쓰기 실패를 정상 경로로 (§8A.4)', () => {
  it('용량 초과 등으로 쓰기가 실패하면 false를 준다', () => {
    installStorage({ failWrites: true });
    expect(saveBuild(CODE, '저장 시도')).toBe(false);
  });

  it('저장소 접근 자체가 던져도 false — 시크릿 모드', () => {
    installStorage({ throwOnAccess: true });
    expect(isStorageAvailable()).toBe(false);
    expect(saveBuild(CODE, 'x')).toBe(false);
    expect(loadBuilds()).toEqual([]);
  });

  it('SSR에서는 저장소가 없다', () => {
    vi.stubGlobal('window', undefined);
    expect(isStorageAvailable()).toBe(false);
    expect(loadBuilds()).toEqual([]);
  });

  it('쓸 수 있으면 true', () => {
    installStorage();
    expect(isStorageAvailable()).toBe(true);
    expect(saveBuild(CODE, '저장됨')).toBe(true);
  });
});

describe('저장 동작', () => {
  it('저장하고 불러온다', () => {
    installStorage();
    saveBuild(CODE, '내 견적');
    expect(loadBuilds()[0]?.label).toBe('내 견적');
  });

  it('이름이 비면 기본 이름을 붙인다', () => {
    installStorage();
    saveBuild(CODE, '   ');
    expect(loadBuilds()[0]?.label).toBe('이름 없는 견적');
  });

  it('같은 코드를 다시 저장하면 중복되지 않고 위로 올라간다', () => {
    installStorage();
    saveBuild(CODE, '처음');
    saveBuild(CODE, '고친 이름');
    const builds = loadBuilds();
    expect(builds).toHaveLength(1);
    expect(builds[0]?.label).toBe('고친 이름');
  });

  it('깨진 코드는 저장하지 않는다', () => {
    installStorage();
    expect(saveBuild('!!broken!!', 'x')).toBe(false);
    expect(loadBuilds()).toEqual([]);
  });

  it('삭제한다', () => {
    installStorage();
    saveBuild(CODE, 'x');
    removeBuild(CODE);
    expect(loadBuilds()).toEqual([]);
  });

  it('상한을 넘으면 오래된 것부터 버린다 (LRU)', () => {
    const data = installStorage();
    // 유효한 코드가 하나뿐이라 목록을 직접 심어 상한 동작만 본다.
    const many = Array.from({ length: LIMITS.builds + 5 }, (_, i) => ({
      v: 1,
      code: CODE,
      label: `견적 ${i}`,
      savedAt: 'x',
    }));
    data.set(STORAGE_KEYS.builds, JSON.stringify(many));
    saveBuild(CODE, '가장 최근');
    const builds = loadBuilds();
    expect(builds.length).toBeLessThanOrEqual(LIMITS.builds);
    expect(builds[0]?.label).toBe('가장 최근');
  });
});

describe('최근 기록', () => {
  it('최근 구성한 견적은 상한 5개', () => {
    const data = installStorage();
    data.set(
      STORAGE_KEYS.recentBuilds,
      JSON.stringify(Array.from({ length: 9 }, (_, i) => ({ v: 1, code: CODE, label: `r${i}`, savedAt: 'x' }))),
    );
    recordRecentBuild(CODE, '새로 구성');
    expect(loadRecentBuilds().length).toBeLessThanOrEqual(LIMITS.recentBuilds);
  });

  it('최근 조회한 부품을 기록한다', () => {
    installStorage();
    recordRecentPart({ id: 'p1', category: 'CPU', name: '9800X3D' });
    recordRecentPart({ id: 'p2', category: 'GPU', name: 'RTX 5080' });
    const parts = loadRecentParts();
    expect(parts[0]?.name).toBe('RTX 5080');
    expect(parts).toHaveLength(2);
  });

  it('같은 부품을 다시 보면 중복 없이 위로 올라간다', () => {
    installStorage();
    recordRecentPart({ id: 'p1', category: 'CPU', name: 'A' });
    recordRecentPart({ id: 'p2', category: 'GPU', name: 'B' });
    recordRecentPart({ id: 'p1', category: 'CPU', name: 'A' });
    const parts = loadRecentParts();
    expect(parts).toHaveLength(2);
    expect(parts[0]?.id).toBe('p1');
  });
});

describe('저장 대상 키가 §8A.1과 맞는다', () => {
  it('키 이름이 스펙대로다', () => {
    // 칸을 더하는 것은 add-only 규칙에 어긋나지 않지만, **문서를 먼저 고쳐야** 한다
    // (CLAUDE.md 작업 규칙 2). 이 목록이 §8A.1의 표와 같아야 한다.
    expect(Object.values(STORAGE_KEYS)).toEqual([
      'builds',
      'recent_builds',
      'recent_parts',
      'draft',
      'prefs',
      'schema_version',
    ]);
  });

  it('상한이 스펙대로다', () => {
    expect(LIMITS).toEqual({ builds: 20, recentBuilds: 5, recentParts: 20 });
  });
});

describe('React 스냅샷 (useSyncExternalStore)', () => {
  it('같은 스냅샷은 참조가 유지된다 — 무한 렌더를 막는 조건', () => {
    installStorage();
    expect(getStorageSnapshot()).toBe(getStorageSnapshot());
  });

  it('서버 스냅샷은 항상 같은 참조이고 비어 있다', () => {
    expect(getServerStorageSnapshot()).toBe(getServerStorageSnapshot());
    expect(getServerStorageSnapshot()).toEqual({ available: false, builds: [], recentBuilds: [] });
  });

  it('쓰기가 일어나면 스냅샷이 갱신되고 구독자에게 알린다', () => {
    installStorage();
    const before = getStorageSnapshot();
    const notify = vi.fn();
    const unsubscribe = subscribeStorage(notify);

    saveBuild(CODE, '새 견적');

    expect(notify).toHaveBeenCalled();
    const after = getStorageSnapshot();
    expect(after).not.toBe(before);
    expect(after.builds[0]?.label).toBe('새 견적');
    unsubscribe();
  });

  it('구독을 해제하면 더 알리지 않는다', () => {
    installStorage();
    const notify = vi.fn();
    subscribeStorage(notify)();
    saveBuild(CODE, 'x');
    expect(notify).not.toHaveBeenCalled();
  });

  it('저장소가 막혀 있으면 available이 false다', () => {
    installStorage({ throwOnAccess: true });
    expect(getStorageSnapshot().available).toBe(false);
  });
});

describe('작업 중인 견적 (draft)', () => {
  it('적어둔 것을 그대로 읽는다', () => {
    installStorage();
    expect(saveDraft(CODE)).toBe(true);
    expect(loadDraft()).toBe(CODE);
  });

  it('★ 저장한 견적 목록과 섞이지 않는다', () => {
    // 칸이 다르다. 섞으면 슬롯을 모두 비운 뒤 새로 고쳤을 때
    // 방금 비운 것이 되살아난다.
    installStorage();
    saveDraft(CODE);
    expect(loadBuilds()).toEqual([]);
    expect(loadRecentBuilds()).toEqual([]);
  });

  it('★ 빈 코드는 적어두지 않고 지운다', () => {
    installStorage();
    saveDraft(CODE);
    expect(saveDraft('')).toBe(true);
    expect(loadDraft()).toBeNull();
  });

  it('깨진 코드는 적어두지 않는다 — 복원이 조용히 실패한다', () => {
    installStorage();
    saveDraft('!!!not-a-code!!!');
    expect(loadDraft()).toBeNull();
  });

  it('깨진 값이 들어 있어도 읽기가 던지지 않는다', () => {
    const data = installStorage();
    data.set(STORAGE_KEYS.draft, '{ this is not json');
    expect(loadDraft()).toBeNull();
    data.set(STORAGE_KEYS.draft, '[]');
    expect(loadDraft()).toBeNull();
    data.set(STORAGE_KEYS.draft, JSON.stringify({ v: 1 }));
    expect(loadDraft()).toBeNull();
  });

  it('버전이 더 높아도 거부하지 않는다 (§8A.2 규칙 2)', () => {
    const data = installStorage();
    data.set(STORAGE_KEYS.draft, JSON.stringify({ v: 99, code: CODE, at: 'x', 새필드: 1 }));
    expect(loadDraft()).toBe(CODE);
  });

  it('저장이 막혀 있어도 던지지 않는다 (§8A.4)', () => {
    installStorage({ failWrites: true });
    expect(saveDraft(CODE)).toBe(false);
    expect(loadDraft()).toBeNull();
  });

  it('clearDraft가 지운다', () => {
    installStorage();
    saveDraft(CODE);
    expect(clearDraft()).toBe(true);
    expect(loadDraft()).toBeNull();
  });
});
