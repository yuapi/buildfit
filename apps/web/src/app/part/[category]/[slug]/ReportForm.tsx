'use client';

import { useActionState, useState } from 'react';
import { getClientToken } from '@/lib/storage';
import { specLabel } from '@/lib/spec-labels';
import { reportSpecAction, type ReportResult } from './actions';

export function ReportForm({
  partId,
  slug,
  category,
  specKeys,
}: {
  partId: string;
  slug: string;
  category: string;
  specKeys: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ReportResult | null, FormData>(
    // 브라우저 토큰은 제출 시점에 읽는다. 렌더에 끌어오면 서버 렌더와 어긋나고,
    // effect로 당겨오면 마운트마다 연쇄 렌더가 난다.
    async (prev, form) => {
      form.set('clientToken', getClientToken());
      return reportSpecAction(prev, form);
    },
    null,
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-neutral-500 underline underline-offset-2"
      >
        스펙이 잘못됐나요? 신고하기
      </button>
    );
  }

  return (
    <form action={action} className="rounded border border-neutral-300 p-4 text-sm dark:border-neutral-700">
      <input type="hidden" name="partId" value={partId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="category" value={category} />

      <h3 className="font-medium">스펙 오류 신고</h3>
      <p className="mt-1 text-xs text-neutral-500">
        신고하면 해당 항목이 &ldquo;검증 중&rdquo;으로 표시되고 확인 후 반영합니다.
        로그인은 필요 없습니다.
      </p>

      <label className="mt-3 block text-xs text-neutral-600 dark:text-neutral-400">
        어느 항목인가요
      </label>
      <select
        name="specKey"
        required
        className="mt-1 w-full rounded border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700"
      >
        {specKeys.map((k) => (
          <option key={k} value={k}>
            {specLabel(k)}
          </option>
        ))}
      </select>

      <label className="mt-3 block text-xs text-neutral-600 dark:text-neutral-400">
        맞다고 생각하는 값 (선택)
      </label>
      <input
        name="reportedValue"
        maxLength={200}
        className="mt-1 w-full rounded border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700"
      />

      <label className="mt-3 block text-xs text-neutral-600 dark:text-neutral-400">
        설명이나 출처 (선택)
      </label>
      <textarea
        name="note"
        rows={2}
        maxLength={500}
        placeholder="제조사 스펙시트 주소를 적어 주시면 확인이 빠릅니다"
        className="mt-1 w-full rounded border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700"
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-neutral-900 px-3 py-1.5 text-xs text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {pending ? '보내는 중…' : '신고'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-neutral-500">
          닫기
        </button>
        {state && (
          <span
            className={
              state.ok
                ? 'text-xs text-green-700 dark:text-green-400'
                : 'text-xs text-red-700 dark:text-red-400'
            }
          >
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
