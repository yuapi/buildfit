/**
 * 저장한 견적 목록의 백업 파일 — `pc-builder-spec.md` §8A.3.
 *
 * > 견적 목록 전체를 JSON으로 내보내기/가져오기 (Phase 1)
 *
 * 저장 목록은 이 브라우저에만 있다. 브라우저를 바꾸거나 데이터를 지우면 사라지고,
 * 지금까지의 백업 수단은 견적마다 공유 링크를 하나씩 복사하는 것뿐이었다.
 *
 * **서버로 보내지 않는다.** 파일은 사용자 기기에서 만들고 읽는다 — 이 모듈은
 * 문자열을 만들고 읽을 뿐 저장소도 네트워크도 모른다.
 *
 * 파일의 항목은 localStorage의 `SavedBuild` 그대로다. 형식을 두 벌 두면 한쪽만
 * 고쳐지는 날이 온다. 그래서 **같은 add-only 규칙**을 따른다 — 파일은 사용자 손에
 * 남아 몇 달 뒤 다른 버전의 코드가 읽는다.
 */

import { type SavedBuild, migrateSavedBuild } from './storage';

export const BACKUP_APP = 'buildfit';
export const BACKUP_KIND = 'saved-builds';
/** 파일 형식 버전. 저장 포맷과 같이 add-only다 */
export const BACKUP_VERSION = 1;

/**
 * 읽을 파일의 상한.
 *
 * 견적 20개는 수 KB다. 이보다 크면 다른 파일을 고른 것이고, 큰 파일을 통째로
 * `JSON.parse`하면 탭이 멈춘다 — 읽기 전에 거른다.
 */
export const MAX_BACKUP_BYTES = 1_000_000;

export interface BuildBackup {
  readonly app: typeof BACKUP_APP;
  readonly kind: typeof BACKUP_KIND;
  readonly v: number;
  readonly exportedAt: string;
  readonly builds: readonly SavedBuild[];
}

/** 목록을 파일 내용으로. 사람이 열어 볼 수 있게 들여 쓴다 */
export function exportBuilds(builds: readonly SavedBuild[], now: Date): string {
  const backup: BuildBackup = {
    app: BACKUP_APP,
    kind: BACKUP_KIND,
    v: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    builds,
  };
  return `${JSON.stringify(backup, null, 2)}\n`;
}

/**
 * 내려받을 파일 이름. **사용자 시계의 날짜**로 짓는다 — UTC로 지으면 한국 오전
 * 9시 전에 받은 파일이 어제 날짜가 된다.
 *
 * **ASCII만 쓴다.** 처음엔 `buildfit-견적-…`이었는데 Chromium이 한글이 든 `download`
 * 이름을 버리고 「download」라는 확장자 없는 파일로 저장했다 (Playwright로 확인).
 */
export function backupFileName(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `buildfit-builds-${y}-${m}-${d}.json`;
}

export type BackupProblem =
  /** 상한보다 크다 — 다른 파일을 골랐다 */
  | 'too-large'
  /** JSON이 아니다 */
  | 'not-json'
  /** JSON이지만 이 도구가 만든 견적 목록 파일이 아니다 (`app`·`kind`) */
  | 'not-backup'
  /** 우리 파일이라고 하는데 목록이 없다 */
  | 'no-list';

export type ParsedBackup =
  | {
      readonly ok: true;
      readonly builds: readonly SavedBuild[];
      /** 읽을 수 없어 버린 항목 수 — 코드가 깨졌거나 모양이 다르다 */
      readonly unreadable: number;
    }
  | { readonly ok: false; readonly problem: BackupProblem };

/**
 * 파일 내용을 읽는다. **형식이 틀리면 아무것도 돌려주지 않는다** — 일부만 믿고
 * 합치면 사용자는 무엇이 들어왔는지 모른다.
 *
 * 항목 하나하나는 `migrateSavedBuild`를 거친다. 저장소를 읽을 때와 같은 규칙이라
 * 코드가 안 읽히는 항목은 버리고(죽은 링크를 목록에 남기지 않는다), 버전이 더
 * 높아도 거부하지 않는다 (§8A.2 규칙 2).
 */
export function parseBackup(text: string): ParsedBackup {
  // 글자 수는 바이트 수의 하한이다. 한글이 섞이면 실제 바이트는 더 크지만,
  // 거르는 목적(엉뚱한 큰 파일)에는 충분하다
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, problem: 'too-large' };

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, problem: 'not-json' };
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, problem: 'not-backup' };
  }
  const o = raw as Record<string, unknown>;
  if (o['app'] !== BACKUP_APP || o['kind'] !== BACKUP_KIND) {
    return { ok: false, problem: 'not-backup' };
  }
  const list = o['builds'];
  if (!Array.isArray(list)) return { ok: false, problem: 'no-list' };

  const builds: SavedBuild[] = [];
  let unreadable = 0;
  for (const item of list) {
    const rec = migrateSavedBuild(item);
    if (rec) builds.push(rec);
    else unreadable += 1;
  }
  return { ok: true, builds, unreadable };
}

export interface MergedBuilds {
  /** 저장소에 쓸 목록. 저장 시각 최신순 */
  readonly builds: readonly SavedBuild[];
  /** 새로 들어간 수 */
  readonly added: number;
  /** 이미 있어 넣지 않은 수 (파일 안에서 겹친 것 포함) */
  readonly duplicate: number;
  /** 상한에 걸려 넣지 못한 수 */
  readonly overLimit: number;
}

function savedTime(b: SavedBuild): number {
  const t = Date.parse(b.savedAt);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * 지금 목록에 파일의 견적을 더한다.
 *
 * - **지금 있는 것은 하나도 빼지 않는다.** 가져오기가 이 브라우저의 견적을 밀어내면
 *   안 된다 — 전체를 최신순으로 잘랐다면 오래된 견적을 들여올 때 지금 것이 사라진다
 * - 같은 코드가 이미 있으면 **지금 것을 둔다.** 이름은 이 브라우저에서 고친 것일 수 있다
 * - 남은 자리만큼 파일의 것을 최신순으로 넣고, 못 넣은 수를 센다 — 조용히 버리지 않는다
 */
export function mergeBuilds(
  current: readonly SavedBuild[],
  incoming: readonly SavedBuild[],
  limit: number,
): MergedBuilds {
  const seen = new Set(current.map((b) => b.code));
  const fresh: SavedBuild[] = [];
  let duplicate = 0;
  for (const b of incoming) {
    if (seen.has(b.code)) {
      duplicate += 1;
      continue;
    }
    seen.add(b.code);
    fresh.push(b);
  }

  const room = Math.max(0, limit - current.length);
  const taken = [...fresh].sort((a, b) => savedTime(b) - savedTime(a)).slice(0, room);
  const builds = [...current, ...taken].sort((a, b) => savedTime(b) - savedTime(a));
  return { builds, added: taken.length, duplicate, overLimit: fresh.length - taken.length };
}

const PROBLEM_TEXT: Record<BackupProblem, string> = {
  'too-large': '파일이 너무 큽니다. buildfit에서 내보낸 견적 목록 파일인지 확인해 주세요.',
  'not-json': '읽을 수 없는 파일입니다. buildfit에서 내보낸 견적 목록 파일인지 확인해 주세요.',
  'not-backup': 'buildfit의 견적 목록 파일이 아닙니다.',
  'no-list': '파일에 견적 목록이 없습니다.',
};

/** 형식 오류 안내. 아무것도 바꾸지 않았다는 것을 함께 말한다 */
export function describeProblem(problem: BackupProblem): string {
  return `${PROBLEM_TEXT[problem]} 저장 목록은 그대로입니다.`;
}

/**
 * 가져오기 결과 한 줄 — 「3개를 더했습니다. 건너뜀: 이미 있음 1개 · 읽을 수 없음 1개」
 *
 * **넣지 못한 것은 이유와 함께 센다.** 0이 아닌 것만 말한다.
 */
export function describeImport(
  merged: Pick<MergedBuilds, 'added' | 'duplicate' | 'overLimit'>,
  unreadable: number,
  limit: number,
): string {
  const head = merged.added > 0 ? `${merged.added}개를 더했습니다.` : '더한 견적이 없습니다.';
  const skipped: string[] = [];
  if (merged.duplicate > 0) skipped.push(`이미 있음 ${merged.duplicate}개`);
  if (unreadable > 0) skipped.push(`읽을 수 없음 ${unreadable}개`);
  if (merged.overLimit > 0) skipped.push(`저장 상한(${limit}개) 초과 ${merged.overLimit}개`);
  if (skipped.length === 0) return head;
  return `${head} 건너뜀: ${skipped.join(' · ')}`;
}
