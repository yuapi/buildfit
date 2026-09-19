'use server';

import { createSpecReport } from '@buildfit/db/part';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db';

export interface ReportResult {
  readonly ok: boolean;
  readonly message: string;
}

/**
 * 스펙 오류 신고 — §5.5.
 *
 * 로그인이 없으므로(ADR-0001) 신고자를 식별하지 않는다. 브라우저 토큰으로
 * 중복만 막는다.
 */
export async function reportSpecAction(
  _prev: ReportResult | null,
  form: FormData,
): Promise<ReportResult> {
  const partId = String(form.get('partId') ?? '');
  const specKey = String(form.get('specKey') ?? '').trim();
  const reportedValue = String(form.get('reportedValue') ?? '').trim();
  const note = String(form.get('note') ?? '').trim();
  const clientToken = String(form.get('clientToken') ?? '').trim();
  const slug = String(form.get('slug') ?? '');
  const category = String(form.get('category') ?? '');

  if (!partId || !specKey) return { ok: false, message: '어느 항목이 잘못됐는지 골라 주세요.' };
  if (!reportedValue && !note) {
    return { ok: false, message: '맞다고 생각하는 값이나 설명 중 하나는 적어 주세요.' };
  }
  if (note.length > 500 || reportedValue.length > 200) {
    return { ok: false, message: '내용이 너무 깁니다.' };
  }

  try {
    await createSpecReport(getDb(), {
      partId,
      specKey,
      reportedValue: reportedValue || null,
      note: note || null,
      clientToken: clientToken || 'anonymous',
    });
  } catch {
    return { ok: false, message: '지금은 신고를 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  }

  revalidatePath(`/part/${category}/${slug}`);
  revalidatePath('/admin');
  return { ok: true, message: '신고했습니다. 확인 후 반영하겠습니다.' };
}
