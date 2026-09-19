'use server';

import { revalidatePath } from 'next/cache';
import { SPEC_REQUIREMENTS } from '@buildfit/compat';
import { saveSpec } from '@buildfit/db/queries';
import { getDb } from '@/lib/db';

export interface SaveResult {
  readonly ok: boolean;
  readonly message: string;
}

/**
 * 스펙 값 저장 — §5.3의 6~7번(사람이 확인·승인 → source_url + verified_at 기록).
 *
 * **허용값이 정의된 필드는 그 값만 받는다.** 규칙 5·6이 문자열 완전 일치로
 * 비교하므로 오타 하나가 판정을 뒤집는다.
 */
export async function saveSpecAction(_prev: SaveResult | null, form: FormData): Promise<SaveResult> {
  const partId = String(form.get('partId') ?? '');
  const category = String(form.get('category') ?? '');
  const specKey = String(form.get('specKey') ?? '');
  const sourceUrl = String(form.get('sourceUrl') ?? '').trim();

  const req = SPEC_REQUIREMENTS.find((r) => r.category === category && r.specKey === specKey);
  if (!req) return { ok: false, message: '알 수 없는 필드입니다.' };

  if (!sourceUrl) {
    return { ok: false, message: '출처 URL은 필수입니다. 나중에 재검증하려면 출처가 있어야 합니다 (§5.5).' };
  }
  try {
    const u = new URL(sourceUrl);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error();
  } catch {
    return { ok: false, message: '출처는 http/https URL이어야 합니다.' };
  }

  let value: unknown;
  if (req.valueType === 'number') {
    const raw = String(form.get('value') ?? '').trim();
    const n = Number(raw);
    if (raw === '' || !Number.isFinite(n)) return { ok: false, message: '숫자를 입력해 주세요.' };
    if (n <= 0) return { ok: false, message: '0 이하는 값으로 받지 않습니다.' };
    value = n;
  } else if (req.valueType === 'boolean') {
    const raw = String(form.get('value') ?? '');
    // 빈 값을 false로 넘기지 않는다. "아직 모름"과 "아니오"는 다른 사실이다.
    if (raw !== 'true' && raw !== 'false') return { ok: false, message: '예/아니오를 선택해 주세요.' };
    value = raw === 'true';
  } else if (req.valueType === 'string[]') {
    const picked = form.getAll('value').map(String).filter((v) => v !== '');
    if (picked.length === 0) return { ok: false, message: '최소 하나를 선택해 주세요.' };
    if (req.options && picked.some((v) => !req.options!.includes(v))) {
      return { ok: false, message: '허용되지 않은 값이 포함되어 있습니다.' };
    }
    value = picked;
  } else {
    const raw = String(form.get('value') ?? '').trim();
    if (raw === '') return { ok: false, message: '값을 입력해 주세요.' };
    if (req.options && !req.options.includes(raw)) {
      return { ok: false, message: '허용되지 않은 값입니다.' };
    }
    value = raw;
  }

  await saveSpec(getDb(), { partId, key: specKey, value, unit: null, sourceUrl });

  revalidatePath('/admin');
  revalidatePath(`/admin/parts/${partId}`);
  revalidatePath(`/admin/gaps/${category}/${specKey}`);

  return { ok: true, message: '저장했습니다. 출처와 확인 시각을 함께 기록했습니다.' };
}
