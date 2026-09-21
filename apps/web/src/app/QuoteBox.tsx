"use client";

/**
 * 견적서 붙여넣기 — ADR-0018.
 *
 * 국내 사용자는 조립 PC 견적서를 받아 들고 온다. 일곱 칸을 손으로 채우는 대신
 * 그 글을 붙여넣어 검증할 수 있어야 한다.
 *
 * **아무것도 자동으로 채우지 않는다.** 줄마다 찾은 것을 보여주고, 사용자가
 * 확인한 것만 견적에 들어간다. 실측으로 한 줄이 부품 하나로 확정되는 비율은
 * 69.8%이고 나머지는 평균 2.7개 중에서 고르게 된다 (n=420).
 * 근거: `docs/research/quote-line-matching.md`
 */

import { useCallback, useState, useTransition } from "react";
import type { QuoteLineResult } from "@buildfit/db/quote";
import { SLOT_META, categoryLabel, type SlotName } from "@/lib/categories";
import { MAX_QUOTE_CHARS } from "@/lib/picker";
import { readQuote } from "./actions";

/** 카테고리 → 슬롯. 견적에 넣을 수 없는 카테고리면 undefined */
function slotOf(category: string): SlotName | undefined {
  return SLOT_META.find((m) => m.category === category)?.slot;
}

export interface QuotePick {
  readonly slot: SlotName;
  readonly id: string;
}

type State =
  | { readonly kind: "idle" }
  | { readonly kind: "failed" }
  | { readonly kind: "done"; readonly lines: readonly QuoteLineResult[] };

export function QuoteBox({ onApply }: { onApply: (picks: readonly QuotePick[]) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  /** 줄 번호 → 고른 부품 id. 고르지 않은 줄은 없다 */
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [busy, start] = useTransition();

  const check = useCallback(() => {
    start(async () => {
      const result = await readQuote(text);
      if (!result.ok) {
        setState({ kind: "failed" });
        return;
      }
      setState({ kind: "done", lines: result.data });
      // 후보가 하나뿐인 줄만 미리 골라둔다. **여럿이면 고르지 않는다** —
      // 우리가 대신 고르면 사용자는 틀린 것을 확인 없이 넣게 된다.
      const next: Record<number, string> = {};
      result.data.forEach((l, i) => {
        const only = l.candidates.length === 1 ? l.candidates[0] : undefined;
        if (only && slotOf(only.category)) next[i] = only.id;
      });
      setPicked(next);
    });
  }, [text]);

  const lines = state.kind === "done" ? state.lines : [];

  /**
   * 고른 것을 슬롯에 배치한다. **한 슬롯에 하나다.**
   *
   * 같은 슬롯을 두 줄이 가리키면 뒤엣것을 넣지 않고 그렇다고 말한다.
   * 조용히 덮으면 사용자는 자기가 고른 것이 사라진 줄 모른다.
   */
  const assignment = new Map<SlotName, { id: string; lineIndex: number }>();
  const conflicts = new Set<number>();
  lines.forEach((l, i) => {
    const id = picked[i];
    if (id === undefined) return;
    const cat = l.candidates.find((c) => c.id === id)?.category;
    const slot = cat ? slotOf(cat) : undefined;
    if (!slot) return;
    if (assignment.has(slot)) conflicts.add(i);
    else assignment.set(slot, { id, lineIndex: i });
  });

  const picks: QuotePick[] = [...assignment].map(([slot, v]) => ({ slot, id: v.id }));
  const skipped = lines.filter((l) => !l.isPart && l.unsupported === null).length;

  if (!open) {
    return (
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-semibold">견적서가 이미 있나요?</h2>
            <p className="mt-1 text-sm text-fg-muted">
              받아 온 견적서를 붙여넣으면 부품을 찾아 채웁니다. 일곱 칸을 손으로 채우지
              않아도 됩니다.
            </p>
          </div>
          <button type="button" onClick={() => setOpen(true)} className="btn btn-secondary shrink-0">
            붙여넣기
          </button>
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby="quote-heading" className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="quote-heading" className="font-semibold">
          견적서 붙여넣기
        </h2>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost px-2 py-1 text-xs">
          닫기
        </button>
      </div>

      <p className="mt-1 text-sm text-fg-muted">
        줄마다 부품을 찾습니다. <strong className="font-medium text-fg">고른 것만 들어갑니다</strong> —
        저절로 채워지지 않습니다.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_QUOTE_CHARS))}
        rows={6}
        aria-label="견적서 내용"
        placeholder={"CPU: AMD 라이젠7 9800X3D\n메인보드: ASUS PRIME B650M-A II\n그래픽카드: GIGABYTE RTX 5080 …"}
        className="field mt-3 font-mono text-xs leading-relaxed"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {/*
          * 진짜 `disabled` 버튼이라 옅게 둔다. WCAG 1.4.3은 동작하지 않는
          * 컨트롤의 대비를 요구하지 않는다 ("Incidental"). 버튼이 아닌 것을
          * 버튼처럼 옅게 그리는 것과는 다른 경우다 (부품 목록 페이지 주석 참조).
          */}
        <button
          type="button"
          onClick={check}
          disabled={busy || text.trim() === ""}
          className="btn btn-primary disabled:opacity-40"
        >
          {busy ? "찾는 중…" : "부품 찾기"}
        </button>
        {picks.length > 0 && (
          <button
            type="button"
            onClick={() => {
              onApply(picks);
              setOpen(false);
            }}
            className="btn btn-secondary"
          >
            고른 <span className="tnum">{picks.length}</span>개를 견적에 넣기
          </button>
        )}
      </div>

      {state.kind === "failed" && (
        <p role="alert" className="mt-3 text-sm text-warn">
          부품을 찾지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      )}

      {state.kind === "done" && (
        <>
          {/*
            * 넓은 화면에서만 높이를 자른다. 좁은 화면에서 안쪽 스크롤을 만들면
            * 손가락이 바깥 페이지와 목록 중 어느 것을 미는지 알 수 없게 된다.
            */}
          <ul className="mt-4 divide-y divide-border border-t border-border text-sm sm:max-h-[32rem] sm:overflow-y-auto">
            {lines.map((l, i) =>
              // 머리글·합계 같은 줄은 한 줄로 모아 아래에서 말한다. 하나씩 늘어놓으면
              // 정작 골라야 할 줄이 묻힌다.
              l.isPart || l.unsupported !== null ? (
                <QuoteRow
                  // 같은 줄이 두 번 나올 수 있어 원문만으로는 키가 안 된다
                  key={`${i}-${l.line}`}
                  line={l}
                  picked={picked[i]}
                  conflict={conflicts.has(i)}
                  onPick={(id) =>
                    setPicked((prev) => {
                      const next = { ...prev };
                      if (id === null) delete next[i];
                      else next[i] = id;
                      return next;
                    })
                  }
                />
              ) : null,
            )}
            {lines.length === 0 && <li className="py-3 text-fg-subtle">읽을 줄이 없습니다.</li>}
          </ul>

          {skipped > 0 && (
            <p className="mt-2 text-xs text-fg-subtle">
              부품 줄로 보이지 않는 <span className="tnum">{skipped}</span>줄은 건너뜁니다.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function QuoteRow({
  line,
  picked,
  conflict,
  onPick,
}: {
  line: QuoteLineResult;
  picked: string | undefined;
  conflict: boolean;
  onPick: (id: string | null) => void;
}) {
  // 견적에 넣을 수 없는 카테고리는 고르게 하지 않는다 (지금은 전부 넣을 수 있다)
  const usable = line.candidates.filter((c) => slotOf(c.category) !== undefined);

  return (
    <li className="py-2.5">
      <p className="truncate text-xs text-fg-subtle" title={line.line}>
        {line.line}
      </p>

      {line.unsupported !== null ? (
        // "못 찾음"과 "아직 다루지 않음"은 사용자가 할 행동이 다르다.
        <p className="mt-1 text-fg-muted">{line.unsupported}는 아직 다루지 않습니다.</p>
      ) : !line.isPart ? (
        <p className="mt-1 text-fg-subtle">부품 줄로 보이지 않아 건너뜁니다.</p>
      ) : usable.length === 0 ? (
        <p className="mt-1 text-fg-muted">
          찾지 못했습니다.{' '}
          <span className="text-fg-subtle">
            {line.terms.length > 0 && `찾은 말: ${line.terms.join(' ')}`}
          </span>
        </p>
      ) : (
        <>
          {/*
            * 체크박스로 보이지만 **하나만** 고를 수 있다 (다른 것을 고르면 앞엣것이
            * 풀린다). 눈으로는 알 수 있어도 스크린리더는 그냥 체크박스 여섯 개로
            * 들린다. fieldset의 설명이 그 제약을 말한다.
            */}
          <fieldset className="mt-1.5">
            <legend className="sr-only">
              이 줄에 넣을 부품 하나를 고르세요 ({usable.length}개 중)
            </legend>
            <ul className="space-y-0.5">
            {usable.map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-baseline gap-2 rounded-(--radius-control) px-1.5 py-1 hover:bg-surface-2">
                  <input
                    type="checkbox"
                    checked={picked === c.id}
                    onChange={(e) => onPick(e.target.checked ? c.id : null)}
                    className="mt-0.5 shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block">{c.name}</span>
                    <span className="block text-xs text-fg-subtle">
                      {categoryLabel(c.category)}
                      {c.brand ? ` · ${c.brand}` : ''}
                      {c.releaseYear ? ` · ${c.releaseYear}년` : ''}
                    </span>
                  </span>
                </label>
              </li>
            ))}
            </ul>
          </fieldset>

          {/* 여럿이면 우리가 고르지 않는다. 왜 안 골랐는지 말해야 한다 */}
          {usable.length > 1 && picked === undefined && (
            <p className="mt-1 px-1.5 text-xs text-fg-subtle">
              {usable.length}개가 맞습니다{line.hasMore ? ' (더 있음)' : ''} — 하나를 고르세요.
            </p>
          )}
          {conflict && (
            <p className="mt-1 px-1.5 text-xs text-warn">
              같은 칸을 앞줄이 이미 채웁니다. 이 줄은 넣지 않습니다.
            </p>
          )}
        </>
      )}
    </li>
  );
}
