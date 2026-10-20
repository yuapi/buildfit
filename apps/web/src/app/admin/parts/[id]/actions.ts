'use server';

import { revalidatePath } from 'next/cache';
import { saveSpecCore, type SaveResult } from '@/app/admin/spec-save';

export type { SaveResult };

/**
 * 부품 하나를 열어 채우는 화면의 저장.
 *
 * 검증과 기록은 `saveSpecCore`가 한다 (두 화면이 한 벌을 쓴다). 여기서는
 * 저장 뒤 다시 그릴 화면만 정한다.
 */
export async function saveSpecAction(_prev: SaveResult | null, form: FormData): Promise<SaveResult> {
  const result = await saveSpecCore(form);
  if (result.saved) {
    revalidatePath('/admin');
    revalidatePath(`/admin/parts/${result.saved.partId}`);
    revalidatePath(`/admin/gaps/${result.saved.category}/${result.saved.specKey}`);
  }
  return { ok: result.ok, message: result.message };
}
