'use client';

import { useActionState, useState } from 'react';
import { SPEC_REQUIREMENTS } from '@buildfit/compat';
import { SpecValueField } from '@/components/SpecValueField';
import { getClientToken } from '@/lib/storage';
import { specLabel } from '@/lib/spec-labels';
import { reportSpecAction, type ReportResult } from './actions';

export function ReportForm({
  partId,
  slug,
  category,
  specKeys,
  missingKeys = [],
}: {
  partId: string;
  slug: string;
  category: string;
  specKeys: readonly string[];
  /** 값이 없는 필수 항목. 견적에서 판정 불가를 만든 원인이다. */
  missingKeys?: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  // 견적에서 넘어온 경우 막고 있던 항목이 먼저 선택돼 있어야 한다.
  const initialKey = missingKeys[0] ?? specKeys[0] ?? '';
  /**
   * 고른 항목. **controlled로 둬야 입력칸 모양을 따라 바꿀 수 있다.**
   *
   * 항목마다 값의 꼴이 다르다 — 폼팩터는 정해진 목록이고 높이는 숫자다.
   * 전에는 전부 자유 입력이었고, 그러면 오타 하나가 규칙을 못 읽게 만든다
   * (`requirements.ts`의 `options` 주석).
   */
  const [specKey, setSpecKey] = useState(initialKey);
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  /** 고른 항목의 선언. 없으면(카탈로그에만 있는 키) 자유 입력으로 둔다 */
  const req = SPEC_REQUIREMENTS.find((r) => r.category === category && r.specKey === specKey);
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
        className="link text-sm text-fg-muted"
      >
        {missingKeys.length > 0 ? '비어 있는 값 알려주기 · 오류 신고' : '스펙이 잘못됐나요? 신고하기'}
      </button>
    );
  }

  return (
    <form action={action} className="card p-4 text-sm">
      <input type="hidden" name="partId" value={partId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="category" value={category} />

      <h3 className="font-medium">{missingKeys.length > 0 ? '값 제보 · 오류 신고' : '스펙 오류 신고'}</h3>
      <p className="mt-1 text-xs text-fg-subtle">
        신고하면 해당 항목이 &ldquo;검증 중&rdquo;으로 표시되고 확인 후 반영합니다.
        로그인은 필요 없습니다.
      </p>

      <label className="mt-3 block text-xs text-fg-muted" htmlFor="report-spec-key">
        어느 항목인가요
      </label>
      <select
        id="report-spec-key"
        name="specKey"
        required
        value={specKey}
        onChange={(e) => {
          setSpecKey(e.target.value);
          // 항목이 바뀌면 값을 비운다. 폼팩터에 적은 글자가 숫자칸에 남으면
          // 사용자가 알아차리지 못한 채 엉뚱한 값을 보낸다.
          setText('');
          setPicked([]);
        }}
        className="field mt-1"
      >
        {/* 비어 있는 필수 항목을 먼저 보여준다. 견적을 막고 있는 것이 이쪽이다. */}
        {missingKeys.length > 0 && (
          <optgroup label="비어 있음 — 판정을 막고 있습니다">
            {missingKeys.map((k) => (
              <option key={k} value={k}>
                {specLabel(k)}
              </option>
            ))}
          </optgroup>
        )}
        {specKeys.length > 0 && (
          <optgroup label="등록된 값">
            {specKeys.map((k) => (
              <option key={k} value={k}>
                {specLabel(k)}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      <label className="mt-3 block text-xs text-fg-muted" htmlFor="reported-value">
        맞다고 생각하는 값
      </label>
      <div className="mt-1">
        {req ? (
          // 어드민과 **같은 한 벌**을 쓴다. 정해진 목록이 있으면 고르게 한다 —
          // 규칙 5·6은 문자열 완전 일치라 오타 하나가 판정을 뒤집는다.
          <SpecValueField
            req={req}
            id="reported-value"
            name="reportedValue"
            text={text}
            picked={picked}
            onText={setText}
            onPicked={setPicked}
          />
        ) : (
          <input
            id="reported-value"
            name="reportedValue"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={200}
            className="field"
          />
        )}
      </div>
      {req?.options && (
        <p className="mt-1 text-xs text-fg-subtle">
          판정이 이 값을 글자 그대로 비교합니다. 목록에 없으면 아래 설명란에 적어 주세요.
        </p>
      )}

      <label className="mt-3 block text-xs text-fg-muted" htmlFor="report-note">
        설명이나 출처 (선택)
      </label>
      <textarea
        id="report-note"
        name="note"
        rows={2}
        maxLength={500}
        placeholder="제조사 스펙시트 주소를 적어 주시면 확인이 빠릅니다"
        className="field mt-1"
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary"
        >
          {pending ? '보내는 중…' : '신고'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-fg-subtle">
          닫기
        </button>
        {state && (
          <span
            className={
              state.ok
                ? 'text-xs text-ok'
                : 'text-xs text-danger'
            }
          >
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
