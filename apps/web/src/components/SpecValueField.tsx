'use client';

import type { FieldRequirement } from '@buildfit/compat';

/**
 * 이 항목을 어떤 칸으로 받을 것인가.
 *
 * 컴포넌트에서 떼어낸 이유는 **선언과 칸이 어긋나는지 테스트가 보게** 하려는
 * 것이다. 실제로 공개 제보 폼이 목록 있는 항목을 자유 입력으로 받고 있었고,
 * 화면을 렌더링하지 않고는 그 사실이 드러나지 않았다.
 */
export type SpecFieldKind = 'boolean' | 'multi' | 'select' | 'number' | 'text';

export function specFieldKind(req: FieldRequirement): SpecFieldKind {
  if (req.valueType === 'boolean') return 'boolean';
  // 목록이 있으면 **자유 입력을 막는다.** 규칙 5·6이 글자 그대로 비교한다.
  if (req.options) return req.valueType === 'string[]' ? 'multi' : 'select';
  return req.valueType === 'number' ? 'number' : 'text';
}

/**
 * 스펙 값 입력칸 — **`SPEC_REQUIREMENTS`가 정한 모양대로** 그린다.
 *
 * `requirements.ts`가 `options`에 대해 못 박아둔 것이 있다:
 *
 * > **있으면 자유 입력을 막아야 한다.** 규칙 5·6은 이 값들을 문자열 완전
 * > 일치로 비교하므로, 오타 하나가 판정을 뒤집는다.
 *
 * 어드민은 그것을 지키고 있었는데 **공개 제보 폼은 전부 자유 입력이었다.**
 * 「지원 파워 폼팩터」에 `atx`나 `ATX 파워`를 적으면 규칙 6이 그 값을 못 읽는다 —
 * 제보를 받아도 쓸 수 없다. 케이스 데이터가 이 프로젝트의 가장 큰 결측이라
 * (규칙 6 판정 불가 84.5%) 그 경로가 헛돌면 곤란하다.
 *
 * 그래서 두 화면이 **이 한 벌**을 쓴다. 한쪽만 고치면 또 갈라진다.
 */
export function SpecValueField({
  req,
  name = 'value',
  id,
  label,
  text,
  picked,
  onText,
  onPicked,
}: {
  readonly req: FieldRequirement;
  /** 폼 필드 이름. 어드민과 제보 폼이 서로 다른 이름을 쓴다 */
  readonly name?: string;
  /**
   * 칸의 `id`. 화면에 보이는 `<label htmlFor>`가 있으면 그것과 맞춘다.
   *
   * **이름표가 칸에 이어져야 한다.** 세 화면이 전부 이름표를 그려 놓고 잇지 않았다 —
   * 화면 낭독기는 「편집 가능, 빈칸」만 읽었다 (axe `label` · `select-name`).
   */
  readonly id?: string;
  /** 보이는 이름표가 없을 때의 이름. 없으면 `req.label` */
  readonly label?: string;
  /** 스칼라 값 */
  readonly text: string;
  /** `string[]` 항목에서 고른 것들 */
  readonly picked: readonly string[];
  readonly onText: (value: string) => void;
  readonly onPicked: (values: string[]) => void;
}) {
  const kind = specFieldKind(req);
  // 보이는 이름표와 이어지면(id) 그것이 이름이다. 아니면 직접 붙인다
  const naming = id ? { id } : { 'aria-label': label ?? req.label };

  if (kind === 'boolean') {
    // 예/아니오를 라디오가 아니라 select로 둔다. 미선택 상태가 값과
    // 구분되어야 한다 — 라디오는 "아직 안 고름"을 표현하기 어렵다.
    return (
      <select {...naming} name={name} value={text} onChange={(e) => onText(e.target.value)} className="field">
        <option value="">선택하세요</option>
        <option value="true">예</option>
        <option value="false">아니오</option>
      </select>
    );
  }

  if (kind === 'multi') {
    return (
      <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
        {/* 여러 개를 고를 수 있다는 것을 스크린리더도 알아야 한다 */}
        <legend className="sr-only">{label ?? req.label} — 해당하는 것을 모두 고르세요</legend>
        {(req.options ?? []).map((opt) => (
          <label key={opt} className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              name={name}
              value={opt}
              checked={picked.includes(opt)}
              onChange={(e) =>
                onPicked(
                  e.target.checked ? [...picked, opt] : picked.filter((v) => v !== opt),
                )
              }
            />
            {opt}
          </label>
        ))}
      </fieldset>
    );
  }

  if (kind === 'select') {
    return (
      <select {...naming} name={name} value={text} onChange={(e) => onText(e.target.value)} className="field">
        <option value="">선택하세요</option>
        {(req.options ?? []).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      {...naming}
      type={kind === 'number' ? 'number' : 'text'}
      name={name}
      step="any"
      value={text}
      onChange={(e) => onText(e.target.value)}
      className="field"
    />
  );
}
