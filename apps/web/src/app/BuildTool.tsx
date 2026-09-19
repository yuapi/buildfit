'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, useTransition } from 'react';
import type { Build, RuleResult } from '@buildfit/compat';
import { evaluate } from '@buildfit/compat';
import { decodeBuildCode, encodeBuildCode } from '@/lib/build-code';
import { SLOT_META, type SlotName } from '@/lib/categories';
import {
  getServerStorageSnapshot,
  getStorageSnapshot,
  recordRecentBuild,
  removeBuild,
  saveBuild,
  subscribeStorage,
} from '@/lib/storage';
import { fetchBuildParts, searchParts, type PartOption } from './actions';

/** Build에서 선택 id만 뽑는다. 공유 코드와 서버 조회의 입력이 된다. */
function toSelection(build: Build) {
  return {
    cpu: build.cpu?.id,
    motherboard: build.motherboard?.id,
    gpu: build.gpu?.id,
    pcCase: build.pcCase?.id,
    psu: build.psu?.id,
    ram: build.ram.map((k) => k.id),
  };
}

function nameOf(build: Build, slot: SlotName): string | null {
  if (slot === 'ram') return build.ram[0]?.name ?? null;
  return build[slot]?.name ?? null;
}

const EMPTY: Build = { cpu: null, motherboard: null, ram: [], gpu: null, pcCase: null, psu: null };

/** 저장·기록에 쓸 기본 이름. 핵심 부품 두 개면 대개 알아본다. */
function autoLabel(build: Build): string {
  const picked = [build.cpu?.name, build.gpu?.name].filter(Boolean) as string[];
  if (picked.length > 0) return picked.join(' + ');
  const any = SLOT_META.map((m) => nameOf(build, m.slot)).find(Boolean);
  return any ?? '빈 견적';
}

/** 고른 부품 개수. 저장·기록할 가치가 있는지 판단한다. */
function pickedCount(build: Build): number {
  return (
    [build.cpu, build.motherboard, build.gpu, build.pcCase, build.psu].filter(Boolean).length +
    build.ram.length
  );
}

export function BuildTool({ initial }: { initial?: Build }) {
  const [build, setBuild] = useState<Build>(initial ?? EMPTY);
  const [openSlot, setOpenSlot] = useState<SlotName | null>(null);
  const [pending, startTransition] = useTransition();

  const verdict = useMemo(() => evaluate(build), [build]);
  const selection = useMemo(() => toSelection(build), [build]);
  const code = useMemo(() => encodeBuildCode(selection), [selection]);
  const anySelected = Object.values(selection).some((v) =>
    Array.isArray(v) ? v.length > 0 : Boolean(v),
  );

  const [loadError, setLoadError] = useState(false);

  const apply = useCallback((next: ReturnType<typeof toSelection>) => {
    startTransition(async () => {
      const result = await fetchBuildParts(next);
      // 실패하면 이전 구성을 그대로 두고 알린다. 고른 것을 날리지 않는다.
      if (result.ok) {
        setBuild(result.data);
        setLoadError(false);
      } else {
        setLoadError(true);
      }
    });
  }, []);

  // 최근 구성 자동 기록. 부품이 둘 이상일 때만 남긴다.
  // 저장 실패는 무시한다 — 편의 기능이라 실패해도 앱은 그대로 동작한다 (§8A.4).
  useEffect(() => {
    if (pickedCount(build) < 2) return;
    recordRecentBuild(encodeBuildCode(toSelection(build)), autoLabel(build));
  }, [build]);

  const loadCode = useCallback(
    (saved: string) => {
      const sel = decodeBuildCode(saved);
      if (!sel) return;
      apply({
        cpu: sel.cpu,
        motherboard: sel.motherboard,
        gpu: sel.gpu,
        pcCase: sel.pcCase,
        psu: sel.psu,
        ram: [...(sel.ram ?? [])],
      });
    },
    [apply],
  );

  const choose = useCallback(
    (slot: SlotName, id: string) => {
      const next = { ...selection };
      if (slot === 'ram') next.ram = [id];
      else next[slot] = id;
      setOpenSlot(null);
      apply(next);
    },
    [selection, apply],
  );

  const clear = useCallback(
    (slot: SlotName) => {
      const next = { ...selection };
      if (slot === 'ram') next.ram = [];
      else next[slot] = undefined;
      apply(next);
    },
    [selection, apply],
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <section>
        <h2 className="text-lg font-medium">부품 선택</h2>
        <ul className="mt-4 divide-y divide-neutral-200 dark:divide-neutral-800">
          {SLOT_META.map((meta) => (
            <SlotRow
              key={meta.slot}
              slot={meta.slot}
              label={meta.label}
              selectedName={nameOf(build, meta.slot)}
              open={openSlot === meta.slot}
              onToggle={() => setOpenSlot(openSlot === meta.slot ? null : meta.slot)}
              onChoose={(id) => choose(meta.slot, id)}
              onClear={() => clear(meta.slot)}
            />
          ))}
        </ul>
      </section>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        {loadError && (
          <p className="mb-4 rounded border border-amber-400 p-3 text-sm text-amber-700 dark:border-amber-600 dark:text-amber-500">
            부품 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요. 고른 구성은 그대로 있습니다.
          </p>
        )}
        <VerdictPanel verdict={verdict} pending={pending} />
        {anySelected && <ShareBox code={code} />}
        <SaveBox
          code={code}
          defaultLabel={autoLabel(build)}
          canSave={pickedCount(build) > 0}
          onLoad={loadCode}
        />
      </aside>
    </div>
  );
}

function SlotRow({
  slot,
  label,
  selectedName,
  open,
  onToggle,
  onChoose,
  onClear,
}: {
  slot: SlotName;
  label: string;
  selectedName: string | null;
  open: boolean;
  onToggle: () => void;
  onChoose: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <li className="py-3">
      <div className="flex items-baseline gap-3">
        <span className="w-20 shrink-0 text-sm text-neutral-500">{label}</span>
        <span className="min-w-0 flex-1 text-sm">
          {selectedName ?? <span className="text-neutral-400">아직 고르지 않음</span>}
        </span>
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 text-sm underline underline-offset-2"
        >
          {open ? '닫기' : selectedName ? '변경' : '선택'}
        </button>
        {selectedName && (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 text-sm text-neutral-500 underline underline-offset-2"
          >
            제거
          </button>
        )}
      </div>
      {open && <PartPicker slot={slot} onChoose={onChoose} />}
    </li>
  );
}

function PartPicker({ slot, onChoose }: { slot: SlotName; onChoose: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<PartOption[]>([]);
  const [failed, setFailed] = useState(false);
  const [loading, startSearch] = useTransition();

  const run = useCallback(
    (q: string) => {
      setQuery(q);
      startSearch(async () => {
        const result = await searchParts(slot, q);
        setFailed(!result.ok);
        if (result.ok) setOptions(result.data);
      });
    },
    [slot],
  );

  // 열릴 때 한 번 채운다.
  // 렌더 중에 상태를 갱신하면 무한 루프가 난다 — 반드시 effect에서 한다.
  useEffect(() => {
    let cancelled = false;
    startSearch(async () => {
      const result = await searchParts(slot, '');
      if (cancelled) return;
      setFailed(!result.ok);
      if (result.ok) setOptions(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [slot]);

  return (
    <div className="mt-3 rounded border border-neutral-300 p-3 dark:border-neutral-700">
      <input
        type="search"
        value={query}
        onChange={(e) => run(e.target.value)}
        placeholder="모델명으로 검색"
        className="w-full rounded border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700"
      />
      <ul className="mt-2 max-h-64 overflow-y-auto text-sm">
        {loading && <li className="py-2 text-neutral-500">찾는 중…</li>}
        {/* "결과 없음"과 "불러오지 못함"은 사용자가 할 행동이 다르다. */}
        {!loading && failed && (
          <li className="py-2 text-amber-700 dark:text-amber-500">
            부품 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </li>
        )}
        {!loading && !failed && options.length === 0 && (
          <li className="py-2 text-neutral-500">결과가 없습니다.</li>
        )}
        {!loading && !failed &&
          options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => onChoose(o.id)}
                className="w-full rounded px-1 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                {o.name}
                <span className="ml-2 text-xs text-neutral-500">
                  {o.brand ?? ''}
                  {o.releaseYear ? ` · ${o.releaseYear}` : ''}
                </span>
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}

const STYLE = {
  error: { dot: 'bg-red-500', text: 'text-red-700 dark:text-red-400', label: '오류' },
  warning: { dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-500', label: '경고' },
  unknown: { dot: 'bg-neutral-400', text: 'text-neutral-600 dark:text-neutral-400', label: '판정 불가' },
  pass: { dot: 'bg-green-500', text: 'text-neutral-700 dark:text-neutral-300', label: '통과' },
} as const;

type Tone = keyof typeof STYLE;

function toneOf(r: RuleResult): Tone {
  if (r.verdict === 'unknown') return 'unknown';
  if (r.verdict === 'pass') return 'pass';
  return r.severity === 'warning' ? 'warning' : 'error';
}

/** 심각한 것부터 보여준다. */
const TONE_RANK: Record<Tone, number> = { error: 0, warning: 1, unknown: 2, pass: 3 };

export function VerdictPanel({
  verdict,
  pending = false,
}: {
  verdict: ReturnType<typeof evaluate>;
  pending?: boolean;
}) {
  const { counts, results } = verdict;
  // 심각한 것부터. 같은 등급 안에서는 규칙 번호순 (docs/compat-rules.md §0.3)
  const sorted = [...results].sort(
    (a, b) => TONE_RANK[toneOf(a)] - TONE_RANK[toneOf(b)] || a.ruleId - b.ruleId,
  );

  return (
    <div className="rounded border border-neutral-300 p-4 dark:border-neutral-700">
      <h2 className="text-lg font-medium">
        판정 {pending && <span className="text-sm font-normal text-neutral-500">갱신 중…</span>}
      </h2>

      {results.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">
          부품을 두 개 이상 고르면 호환성을 판정합니다.
        </p>
      ) : (
        <>
          {/* ADR-0009: "모든 검사 통과"라고 쓰지 않는다. 통과와 판정 불가를 나눠 센다. */}
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            통과 {counts.pass}
            {counts.fail > 0 && ` · 문제 ${counts.fail}`}
            {counts.unknown > 0 && ` · 판정 불가 ${counts.unknown}`}
          </p>

          <ul className="mt-4 space-y-3">
            {sorted.map((r) => {
              const s = STYLE[toneOf(r)];
              return (
                <li key={r.ruleId} className="flex gap-2.5 text-sm">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
                  <div className="min-w-0">
                    <span className={s.text}>{r.message}</span>
                    {r.reason && (
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {r.reason.kind === 'missing' ? '없는 정보: ' : '데이터 이상: '}
                        {r.reason.kind !== 'missing' && `${r.reason.detail} `}
                        {r.reason.fields.map((f) => `${f.part}의 ${f.field}`).join(', ')}
                      </p>
                    )}
                    {r.notes?.map((n) => (
                      <p key={n} className="mt-0.5 text-xs text-neutral-500">
                        {n}
                      </p>
                    ))}
                    {r.skipped?.map((n) => (
                      <p key={n} className="mt-0.5 text-xs text-neutral-500">
                        {n}
                      </p>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function ShareBox({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === 'undefined' ? `/build/${code}` : `${window.location.origin}/build/${code}`;

  return (
    <div className="mt-4 rounded border border-neutral-300 p-4 text-sm dark:border-neutral-700">
      <h3 className="font-medium">공유 링크</h3>
      <p className="mt-1 text-xs text-neutral-500">
        이 링크에 견적 내용이 전부 담겨 있습니다. 브라우저 데이터를 지워도 링크만 있으면
        복원됩니다.
      </p>
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="mt-2 w-full rounded border border-neutral-300 bg-transparent px-2 py-1.5 text-xs dark:border-neutral-700"
      />
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(
            () => setCopied(true),
            () => setCopied(false),
          );
        }}
        className="mt-2 rounded bg-neutral-900 px-3 py-1.5 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900"
      >
        {copied ? '복사했습니다' : '링크 복사'}
      </button>
    </div>
  );
}

function SaveBox({
  code,
  defaultLabel,
  canSave,
  onLoad,
}: {
  code: string;
  defaultLabel: string;
  canSave: boolean;
  onLoad: (code: string) => void;
}) {
  // localStorage는 React 바깥의 스토어다. effect + setState로 끌어오면
  // 연쇄 렌더와 hydration 불일치가 생긴다.
  const { available, builds, recentBuilds } = useSyncExternalStore(
    subscribeStorage,
    getStorageSnapshot,
    getServerStorageSnapshot,
  );
  const [label, setLabel] = useState('');
  const [message, setMessage] = useState('');

  if (!available) {
    return (
      <div className="mt-4 rounded border border-neutral-300 p-4 text-sm dark:border-neutral-700">
        <h3 className="font-medium">저장</h3>
        <p className="mt-1 text-xs text-neutral-500">
          이 브라우저에서는 저장할 수 없습니다. 시크릿 모드이거나 저장이 차단된 것 같습니다.
          위의 공유 링크를 복사해 두면 나중에 그대로 복원됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded border border-neutral-300 p-4 text-sm dark:border-neutral-700">
      <h3 className="font-medium">저장</h3>
      <p className="mt-1 text-xs text-neutral-500">
        이 브라우저에만 저장됩니다. 브라우저 데이터를 지우면 사라지니 공유 링크도 함께
        보관해 두세요.
      </p>

      <div className="mt-2 flex gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={defaultLabel}
          disabled={!canSave}
          className="min-w-0 flex-1 rounded border border-neutral-300 bg-transparent px-2 py-1.5 text-xs disabled:opacity-50 dark:border-neutral-700"
        />
        <button
          type="button"
          disabled={!canSave}
          onClick={() => {
            const ok = saveBuild(code, label || defaultLabel);
            setMessage(
              ok ? '저장했습니다.' : '저장하지 못했습니다. 저장 공간이 가득 찼을 수 있습니다.',
            );
            setLabel('');
          }}
          className="shrink-0 rounded bg-neutral-900 px-3 py-1.5 text-xs text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          저장
        </button>
      </div>
      {message && <p className="mt-1.5 text-xs text-neutral-500">{message}</p>}

      {builds.length > 0 && (
        <>
          <h4 className="mt-4 text-xs font-medium text-neutral-500">저장한 견적 {builds.length}</h4>
          <ul className="mt-1 space-y-1">
            {builds.map((b) => (
              <li key={b.code} className="flex items-baseline gap-2">
                <button
                  type="button"
                  onClick={() => onLoad(b.code)}
                  className="min-w-0 flex-1 truncate text-left text-xs underline underline-offset-2"
                >
                  {b.label}
                </button>
                <button
                  type="button"
                  onClick={() => removeBuild(b.code)}
                  className="shrink-0 text-xs text-neutral-500"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {recentBuilds.length > 0 && (
        <>
          <h4 className="mt-4 text-xs font-medium text-neutral-500">최근 구성</h4>
          <ul className="mt-1 space-y-1">
            {recentBuilds.map((b) => (
              <li key={b.code}>
                <button
                  type="button"
                  onClick={() => onLoad(b.code)}
                  className="w-full truncate text-left text-xs text-neutral-600 underline underline-offset-2 dark:text-neutral-400"
                >
                  {b.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
