/**
 * 드라이브가 어느 자리를 쓰는가.
 *
 * 규칙 17·18·19가 같은 분류를 써야 한다. 한 곳에 둔다.
 * 근거: docs/research/storage-slots.md · docs/compat-rules.md §17~§19
 */

import type { StorageDrive } from './parts';

/** M.2 슬롯을 쓰는가. `M.2-2280` · `M.2 SATA`처럼 M.2로 시작하는 것들. */
export function usesM2Slot(drive: StorageDrive): boolean {
  return /^m\.2/i.test((drive.formFactor ?? '').trim());
}

/**
 * SATA 포트를 쓰는가.
 *
 * **`M.2 SATA`는 세지 않는다.** 그 드라이브가 SATA 포트를 가져가는지는 칩셋의
 * 레인 분배에 달려 있고, 그 데이터가 없어서 규칙 13이 막혀 있다 (§18.1).
 * SAS도 세지 않는다 — 일반 보드에 포트가 없다.
 */
export function usesSataPort(drive: StorageDrive): boolean {
  return /^sata\b/i.test((drive.interface ?? '').trim());
}

/** 케이스 베이를 쓰는가. 쓰면 어느 크기인가. */
export function bayKind(drive: StorageDrive): '3.5' | '2.5' | null {
  const ff = (drive.formFactor ?? '').trim();
  if (ff.startsWith('3.5')) return '3.5';
  if (ff.startsWith('2.5')) return '2.5';
  return null;
}

/**
 * 어느 자리도 세지 못한 드라이브.
 *
 * `PCIe`(확장 슬롯에 꽂는 AIC)와 `mSATA`가 여기 해당한다. **세지 않았다는 사실을
 * 결과에 적는다** — 조용히 빠지면 사용자는 검사한 줄 안다 (§17.1).
 */
export function unplacedDrives(drives: readonly StorageDrive[]): StorageDrive[] {
  return drives.filter((d) => !usesM2Slot(d) && bayKind(d) === null);
}
