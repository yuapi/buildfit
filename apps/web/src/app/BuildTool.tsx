"use client";

import Link from "next/link";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import type { Build, Constraint, RuleResult } from "@buildfit/compat";
import {
  RULE_SUMMARY,
  SLOT_LABELS,
  TIGHT_FIT_RATIO,
  blockingSlots,
  estimatePower,
  evaluate,
  pickerConstraints,
} from "@buildfit/compat";
import { decodeBuildCode, encodeBuildCode } from "@/lib/build-code";
import { FitBar } from "@/components/FitBar";
import { PartIcon } from "@/components/Icons";
import { SLOT_META, type SlotName } from "@/lib/categories";
import { listWithJosa } from "@/lib/korean";
import {
  getServerStorageSnapshot,
  getStorageSnapshot,
  recordRecentBuild,
  removeBuild,
  saveBuild,
  subscribeStorage,
} from "@/lib/storage";
import { fetchBuildParts, searchParts, type PartOption } from "./actions";

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
  if (slot === "ram") return build.ram[0]?.name ?? null;
  return build[slot]?.name ?? null;
}

/** 고른 부품의 상세 페이지 주소. slug가 없으면 링크하지 않는다. */
function detailHref(build: Build, slot: SlotName): string | null {
  const part = slot === "ram" ? build.ram[0] : build[slot];
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
  if (picked.length > 0) return picked.join(" + ");
  const any = SLOT_META.map((m) => nameOf(build, m.slot)).find(Boolean);
  return any ?? "빈 견적";
}

/** 고른 부품 개수. 저장·기록할 가치가 있는지 판단한다. */
function pickedCount(build: Build): number {
  return (
    [
      build.cpu,
      build.motherboard,
      build.gpu,
      build.pcCase,
      build.psu,
      build.cooler,
    ].filter(Boolean).length + build.ram.length
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
      if (slot === "ram") next.ram = [id];
      else next[slot] = id;
      setOpenSlot(null);
      apply(next);
    },
    [selection, apply],
  );

  const clear = useCallback(
    (slot: SlotName) => {
      const next = { ...selection };
      if (slot === "ram") next.ram = [];
      else next[slot] = undefined;
      apply(next);
    },
    [selection, apply],
  );

  const picked = pickedCount(build);

  return (
    <div className="space-y-5">
      {/* 판정을 맨 위 띠로 올린다. 이 도구가 하는 일이 판정이다 (ADR-0015) */}
      <VerdictBar verdict={verdict} build={build} pending={pending} />

      {loadError && (
        <p role="alert" className="verdict-bar verdict-warning text-sm">
          부품 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요. 고른
          구성은 그대로 있습니다.
        </p>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-6">
        <section
          aria-labelledby="slots-heading"
          className="card overflow-hidden"
        >
          <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-2.5">
            <h2 id="slots-heading" className="text-sm font-semibold">
              부품 선택
            </h2>
            <span className="text-xs text-fg-subtle tnum">
              {picked} / {SLOT_META.length}
            </span>
          </div>

          <ul className="divide-y divide-border">
            {SLOT_META.map((meta) => (
              <SlotRow
                key={meta.slot}
                slot={meta.slot}
                category={meta.category}
                label={meta.label}
                selectedName={nameOf(build, meta.slot)}
                detailHref={detailHref(build, meta.slot)}
                constraints={pickerConstraints(build, meta.slot)}
                open={openSlot === meta.slot}
                onToggle={() =>
                  setOpenSlot(openSlot === meta.slot ? null : meta.slot)
                }
                onChoose={(id) => choose(meta.slot, id)}
                onClear={() => clear(meta.slot)}
              />
            ))}
          </ul>
        </section>

        {/* 판정에 딸린 것만 옆에 둔다. 보관·공유는 아래로 내려 왼쪽 아래가
            비지 않게 한다 — 빈 칸이 크면 화면이 미완성으로 보인다 (ADR-0015) */}
        <aside className="space-y-4 lg:sticky lg:top-20">
          <PowerPanel build={build} />
          <FitPanel build={build} />
          <VerdictPanel verdict={verdict} build={build} />
        </aside>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {anySelected && <ShareBox code={code} />}
        <SaveBox
          code={code}
          defaultLabel={autoLabel(build)}
          canSave={picked > 0}
          onLoad={loadCode}
        />
      </div>
    </div>
  );
}

/**
 * 치수 여유.
 *
 * 제품 사진 대신 **가진 치수를 실척으로** 보여준다
 * (`docs/research/product-image-sources.md` §6). 규칙 4·9가 문장으로 말하는
 * 것을 막대로 한 번에 보게 한다. 값이 없으면 아무것도 그리지 않는다 —
 * 없는 치수를 0으로 그리면 "딱 맞음"으로 읽힌다.
 */
function FitPanel({ build }: { build: Build }) {
  const caseMaxGpu = build.pcCase?.maxGpuLengthMm ?? null;
  const caseMaxCooler = build.pcCase?.maxCpuCoolerHeightMm ?? null;
  // 칩만 고른 GPU는 길이를 단정하지 않는다 (규칙 4의 chipOnly와 같은 이유)
  const gpuLen = build.gpu?.chipOnly === true ? null : (build.gpu?.lengthMm ?? null);
  // 수랭은 높이가 관건이 아니다 (규칙 9)
  const coolerH = build.cooler?.waterCooled === true ? null : (build.cooler?.heightMm ?? null);

  // 막대가 판정보다 더 말하면 안 된다. "빠듯함" 기준은 규칙마다 다르다.
  const rows: { label: string; valueMm: number; limitMm: number; tightRatio: number }[] = [];
  if (gpuLen && caseMaxGpu) {
    // 규칙 4는 95% 이상을 빠듯함으로 알린다
    rows.push({
      label: '그래픽카드 길이',
      valueMm: gpuLen,
      limitMm: caseMaxGpu,
      tightRatio: TIGHT_FIT_RATIO,
    });
  }
  if (coolerH && caseMaxCooler) {
    // 규칙 9는 빠듯함을 따로 알리지 않는다 (docs/compat-rules.md §9.3) —
    // 케이스 한계값이 35.2%만 채워져 있어 그 위에 경계를 얹으면 근거 없는
    // 정밀도를 주장하게 된다. 막대도 같은 선을 지킨다.
    rows.push({
      label: 'CPU 쿨러 높이',
      valueMm: coolerH,
      limitMm: caseMaxCooler,
      tightRatio: 1,
    });
  }
  if (rows.length === 0) return null;

  return (
    <section className="card p-4 sm:p-5" aria-labelledby="fit-heading">
      <h2 id="fit-heading" className="text-sm font-semibold">
        케이스 여유
      </h2>
      <div className="mt-3 space-y-4">
        {rows.map((r) => (
          <FitBar key={r.label} {...r} />
        ))}
      </div>
    </section>
  );
}

/**
 * 소비전력 요약.
 *
 * 수치를 크게 낸다. PC 견적에서 사람들이 가장 먼저 확인하는 값이고,
 * 글자 크기가 다 같으면 어디를 봐야 할지 알 수 없다 (ADR-0015).
 *
 * **판정과 같은 함수를 쓴다** — 패널의 수치와 규칙 7의 기준이 어긋나면 안 된다.
 */
function PowerPanel({ build }: { build: Build }) {
  const cpuW = build.cpu ? (build.cpu.ppt ?? build.cpu.tdp) : null;
  const gpuW = build.gpu?.tdp ?? null;
  const modules = build.ram.reduce((n, k) => n + (k.moduleCount ?? 0), 0);
  if (cpuW === null && gpuW === null) return null;

  const est = estimatePower({ cpuW, gpuW, ramModules: modules });
  const psuW = build.psu?.wattage ?? null;

  return (
    <section className="card p-4 sm:p-5" aria-labelledby="power-heading">
      <h2 id="power-heading" className="text-sm font-semibold">
        소비전력
      </h2>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="stat text-3xl">{est.minW}</span>
        <span className="text-fg-subtle">~</span>
        <span className="stat text-3xl">{est.maxW}</span>
        <span className="text-sm text-fg-muted">W</span>
      </p>
      {/* 구간의 폭이 곧 신뢰도 표시다. 점 값을 내지 않는다 (§7.2) */}
      <p className="mt-1 text-xs text-fg-subtle">
        가정 범위. 점 값을 내지 않습니다
      </p>

      <dl className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
        {est.parts.map((p) => (
          <div
            key={p.label}
            className="flex items-baseline justify-between gap-2"
          >
            <dt className="text-fg-muted">{p.label}</dt>
            <dd className="tnum">{p.watts} W</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-fg-muted">권장 파워</dt>
          <dd className="tnum font-medium">{est.recommendedW} W</dd>
        </div>
        {psuW !== null && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-fg-muted">고른 파워</dt>
            <dd className="tnum font-medium">{psuW} W</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function SlotRow({
  slot,
  category,
  label,
  selectedName,
  detailHref,
  constraints,
  open,
  onToggle,
  onChoose,
  onClear,
}: {
  slot: SlotName;
  category: string;
  label: string;
  selectedName: string | null;
  detailHref: string | null;
  constraints: readonly Constraint[];
  open: boolean;
  onToggle: () => void;
  onChoose: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <li className={open ? "bg-surface-2" : ""}>
      {/* 카드 더미가 아니라 표의 한 줄이다. 한 화면에 더 많이 들어간다 (ADR-0015) */}
      <div className="row-grid px-3 py-2 sm:px-4">
        {/* 넓은 화면에서는 두 칸으로 펼치고(contents), 좁으면 쌓인다 */}
        <div className="min-w-0 sm:contents">
          <span className="flex items-center gap-2 text-xs font-medium text-fg-muted">
            {/* 제품 사진이 없으므로 아이콘이 시각적 닻 노릇을 한다 */}
            <PartIcon category={category} className="text-fg-subtle" />
            <span className="truncate">{label}</span>
          </span>
          <span className="min-w-0 text-sm">
            {selectedName ? (
              detailHref ? (
                <Link
                  href={detailHref}
                  className="link block truncate font-medium"
                >
                  {selectedName}
                </Link>
              ) : (
                <span className="block truncate font-medium">
                  {selectedName}
                </span>
              )
            ) : (
              <span className="text-fg-subtle">아직 고르지 않음</span>
            )}
          </span>
        </div>
        <span className="flex shrink-0 items-center gap-0.5 self-center">
          {/*
            * 글자는 "선택"뿐이지만 이런 버튼이 일곱 개다. 스크린리더로 훑으면
            * 전부 같은 이름으로 들려 어느 부품의 것인지 알 수 없다 (WCAG 2.4.6).
            * 눈으로 보는 사람에게는 옆의 라벨이 그 일을 한다.
            */}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={`${label} ${open ? "닫기" : selectedName ? "변경" : "선택"}`}
            className={
              selectedName
                ? "btn btn-ghost px-2 py-1 text-xs"
                : "btn btn-secondary px-2.5 py-1 text-xs"
            }
          >
            {open ? "닫기" : selectedName ? "변경" : "선택"}
          </button>
          {selectedName && (
            <button
              type="button"
              onClick={onClear}
              aria-label={`${label} 제거`}
              className="btn btn-ghost px-2 py-1 text-xs"
            >
              제거
            </button>
          )}
        </span>
      </div>
      {open && (
        <PartPicker slot={slot} constraints={constraints} onChoose={onChoose} />
      )}
    </li>
  );
}

function PartPicker({
  slot,
  constraints,
  onChoose,
}: {
  slot: SlotName;
  /** 이미 고른 부품에서 나온 제약. 비어 있으면 전체를 보여준다 (ADR-0016) */
  constraints: readonly Constraint[];
  onChoose: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<PartOption[]>([]);
  const [hidden, setHidden] = useState(0);
  /** 한글을 무엇으로 바꿔 찾았는지 (ADR-0017). 말하지 않으면 왜 나왔는지 모른다 */
  const [translated, setTranslated] = useState<readonly { from: string; to: string }[]>([]);
  /** 뜻을 모르는 한글. 결과가 0건인 이유가 이것이면 그렇다고 말한다 */
  const [unknown, setUnknown] = useState<readonly string[]>([]);
  const [narrow, setNarrow] = useState(true);
  const [failed, setFailed] = useState(false);
  const [loading, startSearch] = useTransition();

  // 제약을 끄면 빈 배열을 보낸다. 서버가 같은 함수로 처리한다.
  const active = narrow ? constraints : [];

  /**
   * effect 의존성으로 쓸 안정 키.
   *
   * `pickerConstraints`는 호출마다 새 배열을 만든다. 배열을 그대로 의존성에
   * 넣으면 부모가 리렌더될 때마다 effect가 돌아 **검색이 무한히 반복된다.**
   * 내용이 같으면 같은 문자열이 되게 해서 그 고리를 끊는다.
   */
  const key = JSON.stringify(constraints);

  /**
   * 요청 번호. **두 경로가 같은 번호를 쓴다.**
   *
   * 글자를 칠 때마다 요청이 하나씩 나가는데 순서대로 돌아오지 않는다.
   * 게다가 짧은 접두사일수록 느리다 — 숨긴 건수를 세느라 이름이 걸린 집합
   * 전체를 훑기 때문이다 (실측: q='' 13ms vs q='ryzen 7 9800' 2.3ms).
   * 그래서 "ryzen 7 9800"을 빨리 치면 'r'의 결과가 나중에 도착해 화면을 덮는다.
   *
   * 토글을 끄는 effect와 타이핑 run()도 서로를 덮는다. 번호를 공유해야
   * **마지막에 보낸 요청이 이긴다.**
   */
  const seq = useRef(0);

  const apply = useCallback(
    (my: number, result: Awaited<ReturnType<typeof searchParts>>) => {
      if (my !== seq.current) return;
      setFailed(!result.ok);
      if (result.ok) {
        setOptions([...result.data.items]);
        setHidden(result.data.hidden);
        setTranslated(result.data.translated);
        setUnknown(result.data.unknown);
      }
    },
    [],
  );

  const run = useCallback(
    (q: string, cons: readonly Constraint[]) => {
      const my = ++seq.current;
      // 새 요청을 보내는 순간 옛 건수를 지운다. 안 그러면 새 이유 옆에
      // 옛 제약의 숫자가 잠깐 붙는다.
      setHidden(0);
      startSearch(async () => {
        apply(my, await searchParts(slot, q, cons));
      });
    },
    [slot, apply],
  );

  // 열릴 때, 그리고 제약을 켜고 끌 때 다시 채운다.
  // 렌더 중에 상태를 갱신하면 무한 루프가 난다 — 반드시 effect에서 한다.
  useEffect(() => {
    const my = ++seq.current;
    startSearch(async () => {
      // effect 본문에서 setState하면 연쇄 렌더가 난다. 요청 콜백 안에서 지운다.
      setHidden(0);
      apply(my, await searchParts(slot, query, active));
    });
    // query는 입력 때마다 run()이 직접 처리한다. 여기서 보면 글자마다 두 번 돈다.
    // constraints는 내용이 같으면 같은 key가 되므로 배열 대신 key를 본다.
    // 취소는 seq가 맡는다 — effect 안의 플래그로는 run()이 보낸 요청을 못 막는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, narrow, key]);

  const reasons = [...new Set(constraints.map((c) => c.because))];

  return (
    <div className="border-t border-border bg-surface-2 px-3 py-3 sm:px-4">
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          run(e.target.value, active);
        }}
        placeholder="모델명·한글 이름으로 검색 (라이젠, 지포스 5080)"
        aria-label="부품 검색"
        className="field"
        autoFocus
      />

      {/*
        * 한글을 영문으로 바꿔 찾았으면 그렇다고 말한다. 말하지 않으면
        * "라이젠"을 쳤는데 "Ryzen"이 나오는 것이 우연처럼 보인다.
        * aria-live로 두는 이유는 입력 중에 내용이 바뀌기 때문이다.
        *
        * **영문 뒤에 조사를 붙이지 않는다.** 로/으로는 읽는 소리로 갈리는데
        * (geforce→지포스「로」, ryzen→라이젠「으로」) 영문 철자로는 알 수 없다.
        * `josa()`도 한글이 아니면 짐작하지 않는다. "(으)로"는 이 프로젝트가
        * 피하려는 바로 그 문장이므로, 조사가 필요 없게 문장을 짠다.
        */}
      <div aria-live="polite" className="empty:hidden">
        {translated.length > 0 && (
          <p className="mt-1.5 text-xs text-fg-subtle">
            한글을 바꿔 찾았습니다 — {translated.map((t) => `${t.from} → ${t.to}`).join(', ')}
          </p>
        )}
        {unknown.length > 0 && (
          <p className="mt-1.5 text-xs text-warn">
            {unknown.join(', ')}: 카탈로그에서 쓰지 않는 말입니다. 영문 모델명으로 쳐 보세요.
          </p>
        )}
      </div>

      {constraints.length > 0 && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
          <label className="flex items-center gap-1.5 text-fg-muted">
            <input
              type="checkbox"
              checked={narrow}
              onChange={(e) => setNarrow(e.target.checked)}
            />
            맞는 것만 보기
          </label>
          {/* 몇 개를 왜 숨겼는지 말하지 않으면 목록이 짧은 이유를 알 수 없다 */}
          {narrow && hidden > 0 && (
            <span className="text-fg-subtle">
              <span className="tnum">{hidden}</span>개 숨김 — {reasons.join(', ')}
            </span>
          )}
        </div>
      )}

      <ul className="mt-2 max-h-64 space-y-0.5 overflow-y-auto text-sm">
        {loading && <li className="px-1 py-2 text-fg-subtle">찾는 중…</li>}
        {/* "결과 없음"과 "불러오지 못함"은 사용자가 할 행동이 다르다. */}
        {!loading && failed && (
          <li className="px-1 py-2 text-warn">
            부품 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </li>
        )}
        {!loading && !failed && options.length === 0 && (
          <li className="px-1 py-2 text-fg-subtle">
            결과가 없습니다.
            {narrow && hidden > 0 && ' 「맞는 것만 보기」를 끄면 더 나옵니다.'}
          </li>
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
                    {o.brand ?? ""}
                    {o.releaseYear ? ` · ${o.releaseYear}년` : ""}
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
  error: { dot: "bg-danger", text: "text-danger", label: "오류" },
  warning: { dot: "bg-warn", text: "text-warn", label: "경고" },
  // 명세 §4.3의 "정보" 등급. 규칙 12에서 Flashback이 있는 경우가 여기다.
  // 빨간 오류로 보여주면 번거로울 뿐인 상황을 못 쓰는 조합으로 오해시킨다.
  info: { dot: "bg-info", text: "text-info", label: "정보" },
  unknown: { dot: "bg-unknown", text: "text-fg-muted", label: "판정 불가" },
  pass: { dot: "bg-ok", text: "text-fg", label: "통과" },
} as const;

type Tone = keyof typeof STYLE;

function toneOf(r: RuleResult): Tone {
  if (r.verdict === "unknown") return "unknown";
  if (r.verdict === "pass") return "pass";
  if (r.severity === "warning") return "warning";
  return r.severity === "info" ? "info" : "error";
}

/** 심각한 것부터 보여준다. */
const TONE_RANK: Record<Tone, number> = {
  error: 0,
  warning: 1,
  info: 2,
  unknown: 3,
  pass: 4,
};

/** 한 줄 요약. 가장 심각한 등급이 견적 전체의 표정이 된다. */
const HEADLINE: Record<Tone, { text: string; className: string }> = {
  error: { text: "조립되지 않는 조합입니다", className: "text-danger" },
  warning: { text: "확인이 필요합니다", className: "text-warn" },
  info: { text: "알아둘 것이 있습니다", className: "text-info" },
  unknown: {
    text: "데이터가 없어 판정하지 못한 항목이 있습니다",
    className: "text-fg-muted",
  },
  pass: { text: "검사한 항목은 모두 통과했습니다", className: "text-ok" },
};

/** slug로 부품의 카테고리를 되찾는다. 상세 페이지 주소를 만들려면 둘 다 필요하다. */
function partHref(
  build: Build | undefined,
  slug: string | undefined,
): string | null {
  if (!build || !slug) return null;
  for (const meta of SLOT_META) {
    const candidates = meta.slot === "ram" ? build.ram : [build[meta.slot]];
    if (candidates.some((p) => p?.slug === slug)) {
      return `/part/${meta.category.toLowerCase()}/${slug}`;
    }
  }
  return null;
}

/**
 * 판정 띠 — ADR-0015.
 *
 * 화면에서 가장 큰 요소다. 사이드 카드에 두면 부품 목록이 주인공이 되고,
 * 그건 가격비교 사이트의 생김새다. 이 도구가 하는 일은 판정이다.
 *
 * **색만으로 말하지 않는다.** 등급 라벨과 문장을 함께 낸다 (WCAG 1.4.1).
 */
function VerdictBar({
  verdict,
  build,
  pending,
}: {
  verdict: ReturnType<typeof evaluate>;
  build: Build;
  pending: boolean;
}) {
  const { counts, results } = verdict;
  const worst = [...results].sort(
    (a, b) => TONE_RANK[toneOf(a)] - TONE_RANK[toneOf(b)],
  )[0];
  const waiting = blockingSlots(build);

  if (results.length === 0) {
    return (
      <div className="verdict-bar verdict-unknown flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-semibold">판정 대기</span>
        <span className="text-sm">
          부품을 두 개 이상 고르면 검사를 시작합니다.
        </span>
      </div>
    );
  }

  const tone = worst ? toneOf(worst) : "unknown";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`verdict-bar verdict-${tone} flex flex-wrap items-baseline gap-x-4 gap-y-1.5`}
    >
      <span className="text-base font-semibold">{HEADLINE[tone].text}</span>
      <span className="text-sm tnum">
        통과 {counts.pass}
        {counts.fail > 0 && ` · 문제 ${counts.fail}`}
        {counts.unknown > 0 && ` · 판정 불가 ${counts.unknown}`}
      </span>
      {waiting.length > 0 && (
        <span className="text-xs opacity-80">
          {listWithJosa(
            waiting.map((x) => SLOT_LABELS[x]),
            "을",
            "를",
          )}{" "}
          아직 고르지 않음
        </span>
      )}
      {pending && <span className="ml-auto text-xs opacity-70">갱신 중…</span>}
    </div>
  );
}

export function VerdictPanel({
  verdict,
  build,
}: {
  verdict: ReturnType<typeof evaluate>;
  /** 갱신 중 표시는 판정 띠가 맡는다. 두 곳에서 깜빡이면 산만하다 */
  pending?: boolean;
  build?: Build;
}) {
  const { results } = verdict;
  // 심각한 것부터. 같은 등급 안에서는 규칙 번호순 (docs/compat-rules.md §0.3)
  const sorted = [...results].sort(
    (a, b) =>
      TONE_RANK[toneOf(a)] - TONE_RANK[toneOf(b)] || a.ruleId - b.ruleId,
  );

  return (
    <section className="card p-4 sm:p-5" aria-labelledby="verdict-heading">
      <h2 id="verdict-heading" className="text-sm font-semibold">
        검사 항목{" "}
        {results.length > 0 && (
          <span className="text-fg-subtle tnum">{results.length}</span>
        )}
      </h2>

      {results.length === 0 ? (
        /* 빈 화면이 무엇을 할 수 있는지 말하지 않으면 고를 이유가 없다.
           규칙 목록은 packages/compat이 정본이라 여기서 지어내지 않는다.
           "두 개 이상 고르세요"는 위의 판정 띠가 이미 말한다. */
        <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-fg-muted">
          {Object.entries(RULE_SUMMARY)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([id, text]) => (
              <li key={id} className="flex gap-2">
                <span className="shrink-0 text-fg-subtle tnum">{id}</span>
                <span>{text}</span>
              </li>
            ))}
        </ul>
      ) : (
        <>
          {/* 등급 요약과 미선택 안내는 위의 판정 띠가 이미 말한다 (ADR-0015).
              같은 문장을 두 번 쓰지 않는다. 여기는 항목별 사유만 맡는다. */}
          <ul className="mt-3 space-y-3">
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
                    <span className={`mr-1.5 text-xs font-medium ${s.text}`}>
                      {s.label}
                    </span>
                    <span className="text-fg">{r.message}</span>
                    {r.reason && (
                      <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
                        {r.reason.kind === "missing"
                          ? "없는 정보: "
                          : "데이터 이상: "}
                        {r.reason.kind !== "missing" && `${r.reason.detail} `}
                        {r.reason.fields.map((f, i) => {
                          const href = partHref(build, f.slug);
                          return (
                            <span key={`${f.part}-${f.field}`}>
                              {i > 0 && ", "}
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
                        {r.reason.fields.some((f) =>
                          partHref(build, f.slug),
                        ) && (
                          <span className="ml-1">
                            — 아는 값이 있으면 알려주세요
                          </span>
                        )}
                      </p>
                    )}
                    {r.notes?.map((n) => (
                      <p
                        key={n}
                        className="mt-1 text-xs leading-relaxed text-fg-subtle"
                      >
                        {n}
                      </p>
                    ))}
                    {r.skipped?.map((n) => (
                      <p
                        key={n}
                        className="mt-1 text-xs leading-relaxed text-fg-subtle"
                      >
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
    typeof window === "undefined"
      ? `/build/${code}`
      : `${window.location.origin}/build/${code}`;

  return (
    <section className="card p-4 sm:p-5">
      <h3 className="font-semibold">공유 링크</h3>
      <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
        이 링크에 견적 내용이 전부 담겨 있습니다. 브라우저 데이터를 지워도
        링크만 있으면 복원됩니다.
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
        {copied ? "복사했습니다" : "링크 복사"}
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
  const [label, setLabel] = useState("");
  const [message, setMessage] = useState("");

  if (!available) {
    return (
      <section className="card p-4 sm:p-5">
        <h3 className="font-semibold">저장</h3>
        <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
          이 브라우저에서는 저장할 수 없습니다. 시크릿 모드이거나 저장이 차단된
          것 같습니다. 위의 공유 링크를 복사해 두면 나중에 그대로 복원됩니다.
        </p>
      </section>
    );
  }

  return (
    <section className="card p-4 sm:p-5">
      <h3 className="font-semibold">저장</h3>
      <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
        이 브라우저에만 저장됩니다. 브라우저 데이터를 지우면 사라지니 공유
        링크도 함께 보관해 두세요.
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
              ok
                ? "저장했습니다."
                : "저장하지 못했습니다. 저장 공간이 가득 찼을 수 있습니다.",
            );
            setLabel("");
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
          <h4 className="mt-5 text-xs font-medium text-fg-subtle">
            저장한 견적 {builds.length}
          </h4>
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
