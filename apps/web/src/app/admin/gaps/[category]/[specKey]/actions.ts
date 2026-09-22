'use server';

import { saveSpecCore, type SaveResult } from '@/app/admin/spec-save';

export type { SaveResult };

/**
 * 한 필드를 줄줄이 채우는 화면의 저장 — 이슈 #3.
 *
 * **`revalidatePath`를 부르지 않는다.** 저장할 때마다 목록을 다시 그리면 채운
 * 줄이 사라지고 아래 줄들이 위로 밀린다 — 작업자의 커서 아래에서 줄이 바뀐다.
 * 수천 건을 채우는 화면에서 이건 오입력을 만든다.
 *
 * 채운 줄은 화면이 그 자리에 "저장됨"으로 표시하고 그대로 둔다. 목록을 새로
 * 받으려면 새로고침하면 된다 (이 페이지는 `force-dynamic`이다).
 *
 * `/admin`의 결측 집계는 그만큼 낡는다. 그쪽도 `force-dynamic`이라 다음
 * 방문에 다시 센다.
 */
export async function saveGapSpecAction(form: FormData): Promise<SaveResult> {
  const { ok, message } = await saveSpecCore(form);
  return { ok, message };
}
