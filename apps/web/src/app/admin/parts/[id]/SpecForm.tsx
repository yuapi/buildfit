'use client';

import { useActionState, useState } from 'react';
import type { FieldRequirement } from '@buildfit/compat';
import { saveSpecAction, type SaveResult } from './actions';

/**
 * 스펙 입력 폼.
 *
 * **입력을 controlled로 둔다.** React는 폼 액션이 끝나면 uncontrolled 필드를
 * 초기화하는데, 그러면 검증 실패 시 사용자가 넣은 값이 날아간다. 수천 건을
 * 채우는 도구에서 이건 치명적이다.
 */
export function SpecForm({
  partId,
  req,
  current,
  manufacturerUrl,
}: {
  partId: string;
  req: FieldRequirement;
  current: unknown;
  /**
   * 제조사 스펙 페이지. 있으면 출처 칸의 기본값으로 넣는다.
   *
   * 보강에서 가장 오래 걸리는 단계가 출처를 찾는 것이다. 다만 **기본값을
   * 넣었다고 확인한 것이 되지는 않는다.** 그래서 값을 감추지 않고 편집 가능한
   * 입력에 그대로 두고, 바로 옆에 열기 링크를 둔다. 작업자가 페이지를 보고
   * 다른 출처를 썼다면 고칠 수 있어야 한다.
   */
  manufacturerUrl?: string | null;
}) {
  const [state, action, pending] = useActionState<SaveResult | null, FormData>(saveSpecAction, null);

  const [text, setText] = useState(current == null ? '' : String(current));
  const [picked, setPicked] = useState<string[]>(
    Array.isArray(current) ? current.map(String) : [],
  );
  const [sourceUrl, setSourceUrl] = useState(manufacturerUrl ?? '');

  /**
   * 제출 횟수.
   *
   * React는 폼 액션이 끝나면 폼 DOM을 초기화한다. controlled 입력이라도 prop 값이
   * 그대로면 React가 DOM을 다시 쓰지 않아, **상태는 남아 있는데 화면만 비어 보이는**
   * 상태가 된다. 검증에 실패한 사용자가 자기 입력이 날아갔다고 오해한다.
   * 입력부를 이 값으로 key하여 제출마다 다시 마운트시켜 상태와 화면을 맞춘다.
   */
  const [attempt, setAttempt] = useState(0);

  const filled = current != null;

  return (
    <form
      action={action}
      onSubmit={() => setAttempt((n) => n + 1)}
      className={`rounded border p-4 ${
        filled
          ? 'border-neutral-200 dark:border-neutral-800'
          : 'border-amber-400 dark:border-amber-600'
      }`}
    >
      <input type="hidden" name="partId" value={partId} />
      <input type="hidden" name="category" value={req.category} />
      <input type="hidden" name="specKey" value={req.specKey} />

      <div className="flex items-baseline justify-between gap-2">
        <label className="font-medium">
          {req.label}
          {!filled && <span className="ml-2 text-xs font-normal text-amber-700 dark:text-amber-500">비어 있음</span>}
        </label>
        <span className="shrink-0 text-xs text-neutral-500">
          {req.specKey} · 규칙 #{req.ruleId}
        </span>
      </div>

      <div className="mt-3" key={`value-${attempt}`}>
        {req.valueType === 'string[]' && req.options ? (
          <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
            {req.options.map((opt) => (
              <label key={opt} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  name="value"
                  value={opt}
                  checked={picked.includes(opt)}
                  onChange={(e) =>
                    setPicked((prev) =>
                      e.target.checked ? [...prev, opt] : prev.filter((v) => v !== opt),
                    )
                  }
                />
                {opt}
              </label>
            ))}
          </fieldset>
        ) : req.options ? (
          <select
            name="value"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700"
          >
            <option value="">선택하세요</option>
            {req.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={req.valueType === 'number' ? 'number' : 'text'}
            name="value"
            step="any"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700"
          />
        )}
      </div>

      <div className="mt-3" key={`source-${attempt}`}>
        <label className="text-sm text-neutral-600 dark:text-neutral-400">
          출처 URL <span className="text-red-600">*</span>
        </label>
        {manufacturerUrl && (
          <a
            href={manufacturerUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="ml-2 text-xs underline underline-offset-2"
          >
            제조사 스펙 열기 ↗
          </a>
        )}
        <input
          type="url"
          name="sourceUrl"
          required
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="제조사 스펙시트 주소"
          className="mt-1 w-full rounded border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700"
        />
        <p className="mt-1 text-xs text-neutral-500">
          나중에 재검증할 때 출처가 없으면 처음부터 다시 해야 한다 (§5.5).
        </p>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {pending ? '저장 중…' : '확인하고 저장'}
        </button>
        {state && (
          <span
            data-testid="save-message"
            className={
              state.ok
                ? 'text-sm text-green-700 dark:text-green-400'
                : 'text-sm text-red-700 dark:text-red-400'
            }
          >
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
