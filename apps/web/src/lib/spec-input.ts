/**
 * 어드민이 넣은 값을 검사해 저장 가능한 형태로 바꾼다.
 *
 * **서버 의존이 없다.** 저장 동작(`admin/spec-save.ts`)에서 떼어낸 이유는
 * 이 부분이 **테스트 없이는 조용히 틀리는 자리**이기 때문이다.
 * `requirements.ts`가 못 박아둔 것:
 *
 * > `options`가 **있으면 자유 입력을 막아야 한다.** 규칙 5·6은 이 값들을 문자열
 * > 완전 일치로 비교하므로, 오타 하나가 판정을 뒤집는다.
 *
 * 화면은 `SpecValueField` 한 벌로 맞춰 두었지만(공개 제보 폼과 공유),
 * **화면을 믿을 수 없다** — 서버 동작은 화면 없이도 불릴 수 있다.
 */

import type { FieldRequirement } from '@buildfit/compat';

export type ParseResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly message: string };

/**
 * 출처 URL 검사.
 *
 * **비어 있으면 저장하지 않는다.** 나중에 재검증할 때 출처가 없으면 처음부터
 * 다시 해야 한다 (§5.5).
 */
export function parseSourceUrl(raw: unknown): ParseResult {
  const text = String(raw ?? '').trim();
  if (text === '') {
    return {
      ok: false,
      message: '출처 URL은 필수입니다. 나중에 재검증하려면 출처가 있어야 합니다 (§5.5).',
    };
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, message: '출처는 http/https URL이어야 합니다.' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, message: '출처는 http/https URL이어야 합니다.' };
  }
  return { ok: true, value: text };
}

/**
 * 선언된 모양대로 값을 읽는다.
 *
 * `values`는 같은 이름으로 여러 번 온 값이다 (`string[]` 항목의 체크박스).
 */
export function parseSpecValue(req: FieldRequirement, values: readonly unknown[]): ParseResult {
  const first = String(values[0] ?? '').trim();

  if (req.valueType === 'number') {
    const n = Number(first);
    if (first === '' || !Number.isFinite(n)) return { ok: false, message: '숫자를 입력해 주세요.' };
    // 0과 음수는 이 도메인에서 값이 아니다. 원본이 미입력을 0으로 채운 레코드가
    // 실재하고 그 0이 거짓 통과를 만든다 (docs/compat-rules.md §8.4).
    if (n <= 0) return { ok: false, message: '0 이하는 값으로 받지 않습니다.' };
    // 선언된 범위를 벗어나면 오타로 본다. **값에 대한 주장이 아니라 입력 검사다.**
    // 이게 없으면 출시 연도에 999999999가 들어가고 규칙 12가 그대로 읽는다.
    if (req.min !== undefined && n < req.min) {
      return { ok: false, message: `${req.min} 이상이어야 합니다.` };
    }
    if (req.max !== undefined && n > req.max) {
      return { ok: false, message: `${req.max} 이하여야 합니다.` };
    }
    return { ok: true, value: n };
  }

  if (req.valueType === 'boolean') {
    // 빈 값을 false로 넘기지 않는다. "아직 모름"과 "아니오"는 다른 사실이다.
    if (first !== 'true' && first !== 'false') {
      return { ok: false, message: '예/아니오를 선택해 주세요.' };
    }
    return { ok: true, value: first === 'true' };
  }

  if (req.valueType === 'string[]') {
    const picked = values.map((v) => String(v ?? '').trim()).filter((v) => v !== '');
    if (picked.length === 0) return { ok: false, message: '최소 하나를 선택해 주세요.' };
    if (req.options && picked.some((v) => !req.options!.includes(v))) {
      return { ok: false, message: '허용되지 않은 값이 포함되어 있습니다.' };
    }
    // 같은 것을 두 번 담지 않는다. 규칙 5·6은 포함 여부만 보므로 판정은 같지만,
    // 중복이 든 배열이 DB에 남으면 화면과 내보내기에 그대로 나간다.
    return { ok: true, value: [...new Set(picked)] };
  }

  if (first === '') return { ok: false, message: '값을 입력해 주세요.' };
  if (req.options && !req.options.includes(first)) {
    return { ok: false, message: '허용되지 않은 값입니다.' };
  }
  return { ok: true, value: first };
}
