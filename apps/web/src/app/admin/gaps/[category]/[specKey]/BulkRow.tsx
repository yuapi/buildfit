'use client';

import { useState, useTransition } from 'react';
import type { FieldRequirement } from '@buildfit/compat';
import { SpecValueField } from '@/components/SpecValueField';
import { saveGapSpecAction } from './actions';

/**
 * 한 부품의 한 필드를 줄 하나로 채운다 — 이슈 #3.
 *
 * 전에는 줄마다 상세 화면을 열고 채우고 돌아와야 했다. 케이스
 * `supported_psu_form_factors`만 3,196건이므로 그 왕복이 작업량의 대부분이다.
 *
 * **저장한 줄을 목록에서 빼지 않는다.** 빼면 아래 줄들이 위로 밀려 작업자의
 * 커서 아래에서 줄이 바뀐다. 그 자리에 「저장됨」으로 남긴다.
 */
export function BulkRow({
  req,
  part,
}: {
  readonly req: FieldRequirement;
  readonly part: {
    readonly id: string;
    readonly modelName: string;
    readonly brand: string | null;
    readonly releaseYear: number | null;
    readonly manufacturerUrl: string | null;
  };
}) {
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  // 출처 찾기가 보강에서 가장 오래 걸리는 단계다. 제조사 주소가 있으면 넣어 둔다.
  // **넣었다고 확인한 것이 되지는 않으므로** 감추지 않고 편집 가능하게 둔다.
  const [sourceUrl, setSourceUrl] = useState(part.manufacturerUrl ?? '');
  const [state, setState] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(form: HTMLFormElement): void {
    const data = new FormData(form);
    startTransition(async () => {
      setState(await saveGapSpecAction(data));
    });
  }

  const saved = state?.ok === true;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
      className={`py-3 ${saved ? 'opacity-60' : ''}`}
    >
      <input type="hidden" name="partId" value={part.id} />
      <input type="hidden" name="category" value={req.category} />
      <input type="hidden" name="specKey" value={req.specKey} />

      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{part.modelName}</span>
        <span className="text-xs text-fg-subtle">
          {part.brand ?? '제조사 미상'}
          {part.releaseYear === null ? '' : ` · ${part.releaseYear}`}
        </span>
        {part.manufacturerUrl === null ? (
          <span className="text-xs text-fg-subtle">출처를 직접 찾아야 합니다</span>
        ) : (
          <a
            href={part.manufacturerUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="link text-xs"
          >
            제조사 스펙 열기 ↗
          </a>
        )}
        <a
          href={`/admin/parts/${part.id}?focus=${req.specKey}`}
          className="link text-xs text-fg-subtle"
        >
          전체 필드
        </a>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start">
        {/* 입력칸 모양은 상세 화면·공개 제보 폼과 한 벌을 쓴다 (SpecValueField 주석) */}
        <SpecValueField
          req={req}
          label={`${part.modelName}의 ${req.label}`}
          text={text}
          picked={picked}
          onText={setText}
          onPicked={setPicked}
        />
        <input
          type="url"
          name="sourceUrl"
          required
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="출처 URL (필수)"
          aria-label={`${part.modelName}의 출처 URL`}
          className="field"
        />
        <button type="submit" disabled={pending || saved} className="btn btn-primary">
          {saved ? '저장됨' : pending ? '저장 중…' : '저장'}
        </button>
      </div>

      {state && (
        <p className={`mt-1 text-xs ${state.ok ? 'text-ok' : 'text-danger'}`}>{state.message}</p>
      )}
    </form>
  );
}
