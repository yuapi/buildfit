'use client';

import Link from 'next/link';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react';
import type { Build, RuleResult } from '@buildfit/compat';
import { RULE_SUMMARY, SLOT_LABELS, blockingSlots, evaluate } from '@buildfit/compat';
import { decodeBuildCode, encodeBuildCode } from '@/lib/build-code';
import { SLOT_META, type SlotName } from '@/lib/categories';
import { listWithJosa } from '@/lib/korean';
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
    cooler: build.cooler?.id,
    ram: build.ram.map((k) => k.id),
  };
}

function nameOf(build: Build, slot: SlotName): string | null {
  if (slot === 'ram') return build.ram[0]?.name ?? null;
  return build[slot]?.name ?? null;
}

/** 고른 부품의 상세 페이지 주소. slug가 없으면 링크하지 않는다. */
function detailHref(build: Build, slot: SlotName): string | null {
  const part = slot === 'ram' ? build.ram[0] : build[slot];
  const category = SLOT_META.find((m) => m.slot === slot)?.category;
  if (!part?.slug || !category) return null;
  return `/part/${category.toLowerCase()}/${part.slug}`;
}

const EMPTY: Build = {
  cpu: null,
  motherboard: null,
  ram: [],
  gpu: null,
  pcCase: null,
  psu: null,
  cooler: null,
};

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
    [build.cpu, build.motherboard, build.gpu, build.pcCase, build.psu, build.cooler].filter(Boolean)
      .length + build.ram.length
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
        // v1 코드에는 쿨러가 없다. 그 경우 undefined가 그대로 들어간다
        cooler: sel.cooler,
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

  const picked = pickedCount(build);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-8">
      <section aria-labelledby="slots-heading">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="slots-heading" className="text-lg font-semibold">
            부품 선택
          </h2>
          <span className="text-sm text-fg-subtle tnum">
            {picked} / {SLOT_META.length}
          </span>
        </div>

        <ul className="mt-3 space-y-2">
          {SLOT_META.map((meta) => (
            <SlotRow
              key={meta.slot}
              slot={meta.slot}
              label={meta.label}
              selectedName={nameOf(build, meta.slot)}
              detailHref={detailHref(build, meta.slot)}
              open={openSlot === meta.slot}
              onToggle={() => setOpenSlot(openSlot === meta.slot ? null : meta.slot)}
              onChoose={(id) => choose(meta.slot, id)}
              onClear={() => clear(meta.slot)}
            />
          ))}
        </ul>
      </section>

      <aside className="space-y-4 lg:sticky lg:top-20">
        {loadError && (
          <p
            role="alert"
            className="rounded-(--radius-card) border border-warn-border bg-warn-bg p-3 text-sm text-warn"
          >
            부품 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요. 고른 구성은 그대로
            있습니다.
          </p>
        )}
        <VerdictPanel verdict={verdict} pending={pending} build={build} />
        {anySelected && <ShareBox code={code} />}
        <SaveBox
          code={code}
          defaultLabel={autoLabel(build)}
          canSave={picked > 0}
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
  detailHref,
  open,
  onToggle,
  onChoose,
  onClear,
}: {
  slot: SlotName;
  label: string;
  selectedName: string | null;
  detailHref: string | null;
  open: boolean;
  onToggle: () => void;
  onChoose: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <li className={`card overflow-hidden ${open ? 'ring-1 ring-border-strong' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 sm:px-4">
        <span className="w-[5.5rem] shrink-0 text-xs font-medium text-fg-subtle">{label}</span>
        <span className="min-w-0 flex-1 text-sm">
          {selectedName ? (
            detailHref ? (
              <Link href={detailHref} className="link font-medium">
                {selectedName}
              </Link>
            ) : (
              <span className="font-medium">{selectedName}</span>
            )
          ) : (
            <span className="text-fg-subtle">아직 고르지 않음</span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className={selectedName ? 'btn btn-ghost' : 'btn btn-secondary'}
          >
            {open ? '닫기' : selectedName ? '변경' : '선택'}
          </button>
          {selectedName && (
            <button type="button" onClick={onClear} className="btn btn-ghost">
              제거
            </button>
          )}
        </span>
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
    <div className="border-t border-border bg-surface-2 px-3 py-3 sm:px-4">
      <input
        type="search"
        value={query}
        onChange={(e) => run(e.target.value)}
        placeholder="모델명으로 검색"
        aria-label="부품 검색"
        className="field"
        autoFocus
      />
      <ul className="mt-2 max-h-64 space-y-0.5 overflow-y-auto text-sm">
        {loading && <li className="px-1 py-2 text-fg-subtle">찾는 중…</li>}
        {/* "결과 없음"과 "불러오지 못함"은 사용자가 할 행동이 다르다. */}
        {!loading && failed && (
          <li className="px-1 py-2 text-warn">
            부품 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </li>
        )}
        {!loading && !failed && options.length === 0 && (
          <li className="px-1 py-2 text-fg-subtle">결과가 없습니다.</li>
        )}
        {!loading &&
          !failed &&
          options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => onChoose(o.id)}
                className="w-full rounded-(--radius-control) px-2 py-1.5 text-left hover:bg-surface"
              >
                <span className="block truncate">{o.name}</span>
                {(o.brand || o.releaseYear) && (
                  <span className="mt-0.5 block text-xs text-fg-subtle">
                    {o.brand ?? ''}
                    {o.releaseYear ? ` · ${o.releaseYear}년` : ''}
                  </span>
                )}
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}

/**
 * 판정 등급 표시 — ADR-0014.
 *
 * **색만으로 구분하지 않는다.** 점 색과 함께 등급 라벨을 글자로 낸다 (WCAG 1.4.1).
 * 색 리터럴 대신 의미 토큰을 쓴다.
 */
const STYLE = {
  error: { dot: 'bg-danger', text: 'text-danger', label: '오류' },
  warning: { dot: 'bg-warn', text: 'text-warn', label: '경고' },
  // 명세 §4.3의 "정보" 등급. 규칙 12에서 Flashback이 있는 경우가 여기다.
  // 빨간 오류로 보여주면 번거로울 뿐인 상황을 못 쓰는 조합으로 오해시킨다.
  info: { dot: 'bg-info', text: 'text-info', label: '정보' },
  unknown: { dot: 'bg-unknown', text: 'text-fg-muted', label: '판정 불가' },
  pass: { dot: 'bg-ok', text: 'text-fg', label: '통과' },
} as const;

type Tone = keyof typeof STYLE;

function toneOf(r: RuleResult): Tone {
  if (r.verdict === 'unknown') return 'unknown';
  if (r.verdict === 'pass') return 'pass';
  if (r.severity === 'warning') return 'warning';
  return r.severity === 'info' ? 'info' : 'error';
}

/** 심각한 것부터 보여준다. */
const TONE_RANK: Record<Tone, number> = { error: 0, warning: 1, info: 2, unknown: 3, pass: 4 };

/** 한 줄 요약. 가장 심각한 등급이 견적 전체의 표정이 된다. */
const HEADLINE: Record<Tone, { text: string; className: string }> = {
  error: { text: '조립되지 않는 조합입니다', className: 'text-danger' },
  warning: { text: '확인이 필요합니다', className: 'text-warn' },
  info: { text: '알아둘 것이 있습니다', className: 'text-info' },
  unknown: { text: '데이터가 없어 판정하지 못한 항목이 있습니다', className: 'text-fg-muted' },
  pass: { text: '검사한 항목은 모두 통과했습니다', className: 'text-ok' },
};

/** slug로 부품의 카테고리를 되찾는다. 상세 페이지 주소를 만들려면 둘 다 필요하다. */
function partHref(build: Build | undefined, slug: string | undefined): string | null {
  if (!build || !slug) return null;
  for (const meta of SLOT_META) {
    const candidates = meta.slot === 'ram' ? build.ram : [build[meta.slot]];
    if (candidates.some((p) => p?.slug === slug)) {
      return `/part/${meta.category.toLowerCase()}/${slug}`;
    }
  }
  return null;
}

export function VerdictPanel({
  verdict,
  pending = false,
  build,
}: {
  verdict: ReturnType<typeof evaluate>;
  pending?: boolean;
  build?: Build;
}) {
  const { counts, results } = verdict;
  // 심각한 것부터. 같은 등급 안에서는 규칙 번호순 (docs/compat-rules.md §0.3)
  const sorted = [...results].sort(
    (a, b) => TONE_RANK[toneOf(a)] - TONE_RANK[toneOf(b)] || a.ruleId - b.ruleId,
  );

  // 아직 고르지 않은 부품 때문에 돌지 못한 규칙. **결측과 다르다.**
  // 이걸 말하지 않으면 CPU와 보드만 고른 사람이 "통과 4"를 보고 견적이
  // 확인됐다고 믿는다. 이 도구가 낼 수 있는 가장 나쁜 결과다 (명세 §4.3).
  const waiting = build ? blockingSlots(build) : [];
  const worst = sorted[0] ? toneOf(sorted[0]) : null;

  return (
    <section className="card p-4 sm:p-5" aria-labelledby="verdict-heading">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="verdict-heading" className="text-lg font-semibold">
          판정
        </h2>
        {pending && <span className="text-xs text-fg-subtle">갱신 중…</span>}
      </div>

      {results.length === 0 ? (
        <>
          <p className="mt-1 text-sm text-fg-muted">
            부품을 두 개 이상 고르면 판정을 시작합니다.
          </p>
          {/* 빈 화면이 무엇을 할 수 있는지 말하지 않으면 고를 이유가 없다.
              규칙 목록은 packages/compat이 정본이라 여기서 지어내지 않는다. */}
          <h3 className="mt-4 text-xs font-medium text-fg-subtle">검사하는 항목</h3>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-fg-muted">
            {Object.entries(RULE_SUMMARY)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([id, text]) => (
                <li key={id} className="flex gap-2">
                  <span className="shrink-0 text-fg-subtle tnum">{id}</span>
                  <span>{text}</span>
                </li>
              ))}
          </ul>
        </>
      ) : (
        <>
          {worst && (
            <p className={`mt-1 text-sm font-medium ${HEADLINE[worst].className}`}>
              {HEADLINE[worst].text}
            </p>
          )}

          {/* ADR-0009: "모든 검사 통과"라고 쓰지 않는다. 통과와 판정 불가를 나눠 센다. */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="chip tnum">통과 {counts.pass}</span>
            {counts.fail > 0 && <span className="chip tnum">문제 {counts.fail}</span>}
            {counts.unknown > 0 && <span className="chip tnum">판정 불가 {counts.unknown}</span>}
          </div>

          {waiting.length > 0 && (
            <p className="mt-2.5 text-xs leading-relaxed text-fg-subtle">
              {listWithJosa(
                waiting.map((s) => SLOT_LABELS[s]),
                '을',
                '를',
              )}{' '}
              아직 고르지 않아 검사하지 못한 항목이 있습니다.
            </p>
          )}

          <ul className="mt-4 space-y-3 border-t border-border pt-4">
            {sorted.map((r) => {
              const tone = toneOf(r);
              const s = STYLE[tone];
              return (
                <li key={r.ruleId} className="flex gap-2.5 text-sm">
                  <span
                    className={`mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    {/* 색만으로 등급을 구분하지 않는다 (ADR-0014) */}
                    <span className={`mr-1.5 text-xs font-medium ${s.text}`}>{s.label}</span>
                    <span className="text-fg">{r.message}</span>
                    {r.reason && (
                      <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
                        {r.reason.kind === 'missing' ? '없는 정보: ' : '데이터 이상: '}
                        {r.reason.kind !== 'missing' && `${r.reason.detail} `}
                        {r.reason.fields.map((f, i) => {
                          const href = partHref(build, f.slug);
                          return (
                            <span key={`${f.part}-${f.field}`}>
                              {i > 0 && ', '}
                              {/* 판정 불가를 만난 사람이 그 값을 아는 경우가 있다.
                                  거기서 제보로 이어지는 것이 가장 값싼 보강 경로다 (§5.5). */}
                              {href ? (
                                <Link href={href} className="link">
                                  {f.part}의 {f.field}
                                </Link>
                              ) : (
                                `${f.part}의 ${f.field}`
                              )}
                            </span>
                          );
                        })}
                        {r.reason.fields.some((f) => partHref(build, f.slug)) && (
                          <span className="ml-1">— 아는 값이 있으면 알려주세요</span>
                        )}
                      </p>
                    )}
                    {r.notes?.map((n) => (
                      <p key={n} className="mt-1 text-xs leading-relaxed text-fg-subtle">
                        {n}
                      </p>
                    ))}
                    {r.skipped?.map((n) => (
                      <p key={n} className="mt-1 text-xs leading-relaxed text-fg-subtle">
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
    </section>
  );
}

function ShareBox({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window === 'undefined' ? `/build/${code}` : `${window.location.origin}/build/${code}`;

  return (
    <section className="card p-4 sm:p-5">
      <h3 className="font-semibold">공유 링크</h3>
      <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
        이 링크에 견적 내용이 전부 담겨 있습니다. 브라우저 데이터를 지워도 링크만 있으면
        복원됩니다.
      </p>
      <input
        readOnly
        value={url}
        aria-label="공유 링크"
        onFocus={(e) => e.currentTarget.select()}
        className="field mt-2 text-xs"
      />
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(
            () => setCopied(true),
            () => setCopied(false),
          );
        }}
        className="btn btn-primary mt-2 w-full"
      >
        {copied ? '복사했습니다' : '링크 복사'}
      </button>
    </section>
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
      <section className="card p-4 sm:p-5">
        <h3 className="font-semibold">저장</h3>
        <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
          이 브라우저에서는 저장할 수 없습니다. 시크릿 모드이거나 저장이 차단된 것 같습니다.
          위의 공유 링크를 복사해 두면 나중에 그대로 복원됩니다.
        </p>
      </section>
    );
  }

  return (
    <section className="card p-4 sm:p-5">
      <h3 className="font-semibold">저장</h3>
      <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
        이 브라우저에만 저장됩니다. 브라우저 데이터를 지우면 사라지니 공유 링크도 함께 보관해
        두세요.
      </p>

      <div className="mt-2 flex gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={defaultLabel}
          aria-label="견적 이름"
          disabled={!canSave}
          className="field min-w-0 flex-1 text-xs disabled:opacity-50"
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
          className="btn btn-primary shrink-0"
        >
          저장
        </button>
      </div>
      {message && (
        <p className="mt-1.5 text-xs text-fg-subtle" role="status">
          {message}
        </p>
      )}

      {builds.length > 0 && (
        <>
          <h4 className="mt-5 text-xs font-medium text-fg-subtle">저장한 견적 {builds.length}</h4>
          <ul className="mt-1.5 space-y-0.5">
            {builds.map((b) => (
              <li key={b.code} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onLoad(b.code)}
                  className="min-w-0 flex-1 truncate rounded-(--radius-control) px-2 py-1.5 text-left text-xs hover:bg-surface-2"
                >
                  {b.label}
                </button>
                <button
                  type="button"
                  onClick={() => removeBuild(b.code)}
                  aria-label={`${b.label} 삭제`}
                  className="btn btn-ghost shrink-0 px-2 py-1 text-xs"
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
          <h4 className="mt-5 text-xs font-medium text-fg-subtle">최근 구성</h4>
          <ul className="mt-1.5 space-y-0.5">
            {recentBuilds.map((b) => (
              <li key={b.code}>
                <button
                  type="button"
                  onClick={() => onLoad(b.code)}
                  className="w-full truncate rounded-(--radius-control) px-2 py-1.5 text-left text-xs text-fg-muted hover:bg-surface-2"
                >
                  {b.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
