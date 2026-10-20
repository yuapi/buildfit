/**
 * 스펙 값 저장의 검증·기록 본체.
 *
 * 두 화면이 쓴다 — 부품 하나를 여는 `/admin/parts/[id]`와 한 필드를 줄줄이
 * 채우는 `/admin/gaps/[category]/[specKey]`. **검증이 두 벌이 되면 한쪽으로
 * 들어온 오타가 규칙 5·6의 문자열 비교를 깬다.**
 *
 * 두 화면의 차이는 저장 뒤 무엇을 다시 그리느냐뿐이고, 그것은 각자의 서버
 * 동작이 정한다.
 */

import { SPEC_REQUIREMENTS } from '@buildfit/compat';
import { saveSpec } from '@buildfit/db/queries';
import { requireAdmin } from '@/lib/admin-auth';
import { getDb } from '@/lib/db';
import { parseSourceUrl, parseSpecValue } from '@/lib/spec-input';

export interface SaveResult {
  readonly ok: boolean;
  readonly message: string;
}

/** 저장에 성공하면 어떤 (부품, 필드)였는지 알려준다. 호출자가 revalidate에 쓴다. */
export interface SavedRef {
  readonly partId: string;
  readonly category: string;
  readonly specKey: string;
}

/**
 * 스펙 값 저장 — §5.3의 6~7번(사람이 확인·승인 → source_url + verified_at 기록).
 *
 * **허용값이 정의된 필드는 그 값만 받는다.** 규칙 5·6이 문자열 완전 일치로
 * 비교하므로 오타 하나가 판정을 뒤집는다.
 */
export async function saveSpecCore(
  form: FormData,
): Promise<SaveResult & { readonly saved?: SavedRef }> {
  // 서버 동작은 화면과 따로 불릴 수 있다. 화면을 막은 것으로 갈음하지 않는다 (ADR-0020).
  await requireAdmin();

  const partId = String(form.get('partId') ?? '');
  const category = String(form.get('category') ?? '');
  const specKey = String(form.get('specKey') ?? '');
  const sourceUrl = form.get('sourceUrl');

  const req = SPEC_REQUIREMENTS.find((r) => r.category === category && r.specKey === specKey);
  if (!req) return { ok: false, message: '알 수 없는 필드입니다.' };

  const source = parseSourceUrl(sourceUrl);
  if (!source.ok) return source;

  const parsed = parseSpecValue(req, form.getAll('value'));
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  /**
   * DB 계층이 던지는 것을 **결과로 바꾼다.**
   *
   * `saveSpec`은 마지막 문이라 카테고리 불일치·범위 밖·없는 부품에 대해 던진다.
   * 그대로 두면 서버 동작이 거부되고 화면에는 아무 말도 남지 않는다 —
   * 수천 건을 채우는 사람이 무엇이 잘못됐는지 알 수 없다.
   *
   * **메시지를 그대로 내보내지 않는다.** 이 경로는 어드민 전용이지만, 던진 것이
   * DB 오류면 쿼리문이 딸려 온다.
   */
  try {
    await saveSpec(getDb(), {
      partId,
      key: specKey,
      value,
      unit: null,
      sourceUrl: String(source.value),
    });
  } catch (err) {
    const known =
      err instanceof Error &&
      (KNOWN_REFUSALS.some((k) => err.message.startsWith(k)) ||
        err.message.includes('를 저장할 수 없습니다'));
    return {
      ok: false,
      message: known ? (err as Error).message : '저장하지 못했습니다. 값을 확인해 주세요.',
    };
  }

  return {
    ok: true,
    message: '저장했습니다. 출처와 확인 시각을 함께 기록했습니다.',
    saved: { partId, category, specKey },
  };
}

/**
 * 사용자에게 그대로 보여도 되는 거절 사유.
 *
 * `saveSpec`이 던지는 것 중 **우리가 문구를 쓴 것**만이다. DB가 던진 것은
 * 여기 걸리지 않고 일반 문구로 나간다.
 */
const KNOWN_REFUSALS = ['출처 URL 없이', '없는 부품', '출시 연도는'] as const;
