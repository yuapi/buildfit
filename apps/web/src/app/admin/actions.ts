'use server';

import { rejectSpecReport } from '@buildfit/db/part';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-auth';
import { getDb } from '@/lib/db';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 신고 거절 — 신고한 값이 틀렸다고 확인했을 때 (§5.5, T-18).
 *
 * 값을 고쳐 저장하는 쪽은 `saveSpec`이 그 항목의 열린 신고를 함께 닫는다. 이것은 값을 바꾸지 않고
 * 신고만 닫는 길이다. 없으면 틀린 신고의 「검증 중」이 영영 남는다.
 */
export async function rejectReportAction(form: FormData): Promise<void> {
  // 서버 동작은 화면과 따로 불릴 수 있다 (ADR-0020)
  await requireAdmin();
  const id = String(form.get('reportId') ?? '');
  if (!UUID.test(id)) return;
  try {
    await rejectSpecReport(getDb(), id);
  } catch {
    // 목록을 다시 그리면 그대로 남아 있어 실패를 알 수 있다
  }
  revalidatePath('/admin');
}
