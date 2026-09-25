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
import type { Build, Constraint, FieldRef, RuleResult } from "@buildfit/compat";
import {
  RULE_SUMMARY,
  SLOT_LABELS,
  TIGHT_FIT_RATIO,
  blockingSlots,
  describeExcluded,
  estimatePower,
  evaluate,
  pickerConstraints,
} from "@buildfit/compat";
import { decodeBuildCode, encodeBuildCode } from "@/lib/build-code";
import { FitBar } from "@/components/FitBar";
import { PartIcon } from "@/components/Icons";
import { buildLabel, countsText, filledSlotCount, pickedCount } from "@/lib/build-summary";
import { addToSlot, isMultiSlot, maxForSlot, removeFromSlot } from "@/lib/multi-slot";
import { SLOT_META, type SlotName } from "@/lib/categories";
import { ElectricityPanel } from "./ElectricityPanel";
import { NO_CURSOR, nextCursor } from "@/lib/list-cursor";
import { listWithJosa } from "@/lib/korean";
import { groupFieldsByPart } from "@/lib/field-refs";
import {
  clearDraft,
  getServerStorageSnapshot,
  getStorageSnapshot,
  loadDraft,
  recordRecentBuild,
  removeBuild,
  saveBuild,
  saveDraft,
  subscribeStorage,
} from "@/lib/storage";
import { MAX_LIMIT, PAGE } from "@/lib/picker";
import { fetchBuildParts, searchParts, type PartOption } from "./actions";
import { QuoteBox, type QuotePick } from "./QuoteBox";

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
    storage: build.storage.map((d) => d.id),
  };
}

/** 한 칸에 들어 있는 부품들. 메모리와 스토리지는 여럿일 수 있다 */
interface PickedPart {
  readonly id: string;
  readonly name: string;
  /** 상세 페이지 주소. slug가 없으면 링크하지 않는다 */
  readonly href: string | null;
}

function partsInSlot(build: Build, slot: SlotName) {
  if (slot === "ram") return build.ram;
  if (slot === "storage") return build.storage;
  return [build[slot]];
}

function pickedIn(build: Build, meta: (typeof SLOT_META)[number]): PickedPart[] {
  const parts = partsInSlot(build, meta.slot);
  return parts.filter((p) => p != null).map((p) => ({
    id: p.id,
    name: p.name,
    href: p.slug ? `/part/${meta.category.toLowerCase()}/${p.slug}` : null,
  }));
}

const EMPTY: Build = {
  cpu: null,
  motherboard: null,
  ram: [],
  gpu: null,
  pcCase: null,
  psu: null,
  cooler: null,
  storage: [],
};

/*
 * 이름과 개수는 `lib/build-summary.ts`가 정본이다.
 *
 * 공유 링크 미리보기가 같은 것을 쓴다 — 미리보기에 적힌 이름과 화면의 이름이
 * 다르면 받은 사람이 다른 견적으로 읽는다.
 */

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
  /**
   * 지난번 하던 것을 불러왔는가.
   *
   * 말없이 채우면 사용자는 부품이 왜 들어 있는지 모른다. 불러왔다고 적고
   * 비울 길을 같이 준다.
   */
  const [restored, setRestored] = useState(false);

  /**
   * 작업 중인 견적을 적어둘 단계인가.
   *
   * 복원이 끝나기 전에 쓰면 **마운트 직후의 빈 구성이 지난번 것을 지운다.**
   * 복원은 서버 왕복이라 즉시 끝나지 않으므로, 끝났다는 신호가 필요하다.
   */
  const phase = useRef<"restoring" | "live">(initial === undefined ? "restoring" : "live");

  const apply = useCallback(
    (next: ReturnType<typeof toSelection>, opts: { restored?: boolean } = {}) => {
      startTransition(async () => {
        const result = await fetchBuildParts(next);
        // 어느 쪽이든 복원 단계는 끝난다. 실패한 채로 멈추면 이후 작업이
        // 하나도 기록되지 않는다.
        phase.current = "live";
        // 실패하면 이전 구성을 그대로 두고 알린다. 고른 것을 날리지 않는다.
        if (result.ok) {
          setBuild(result.data);
          setLoadError(false);
          if (opts.restored === true) setRestored(true);
        } else {
          setLoadError(true);
        }
      });
    },
    [],
  );

  // 최근 구성 자동 기록. 부품이 둘 이상일 때만 남긴다.
  // 저장 실패는 무시한다 — 편의 기능이라 실패해도 앱은 그대로 동작한다 (§8A.4).
  useEffect(() => {
    if (pickedCount(build) < 2) return;
    recordRecentBuild(encodeBuildCode(toSelection(build)), buildLabel(build));
  }, [build]);

  /**
   * 작업 중인 것을 계속 적어둔다.
   *
   * **복원을 시도하기 전에는 쓰지 않는다.** 마운트 직후의 빈 구성을 먼저 쓰면
   * 그 순간 지난번 것이 지워진다.
   */
  useEffect(() => {
    if (phase.current === "restoring") return;
    // 빈 견적은 적어두지 않는다. 빈 코드도 멀쩡한 코드라서, 그대로 쓰면
    // 「비우고 새로 시작」이 칸을 지우지 않고 "빈 것"을 적어두게 된다.
    saveDraft(pickedCount(build) === 0 ? "" : encodeBuildCode(toSelection(build)));
  }, [build]);

  const startOver = useCallback(() => {
    clearDraft();
    setRestored(false);
    setBuild(EMPTY);
    setOpenSlot(null);
  }, []);

  const loadCode = useCallback(
    (saved: string, opts: { restored?: boolean } = {}) => {
      const sel = decodeBuildCode(saved);
      if (!sel) {
        // 깨진 코드였다. 복원 단계에 갇히지 않게 풀어준다.
        phase.current = "live";
        return;
      }
      apply(
        {
          cpu: sel.cpu,
          motherboard: sel.motherboard,
          gpu: sel.gpu,
          pcCase: sel.pcCase,
          psu: sel.psu,
          // v1 코드에는 쿨러가 없다. 그 경우 undefined가 그대로 들어간다
          cooler: sel.cooler,
          ram: [...(sel.ram ?? [])],
          // v1·v2 코드에는 스토리지가 없다. 그 경우 빈 배열이다
          storage: [...(sel.storage ?? [])],
        },
        opts,
      );
    },
    [apply],
  );

  /**
   * 작업 중이던 견적을 이어서 연다.
   *
   * 새로 고침 한 번에 고른 것이 전부 날아가고 있었다. 저장 버튼을 눌러야만
   * 남았는데, 다섯 칸을 채우다 실수로 새로 고치는 것이 바로 그 저장을
   * 하기 전이다.
   *
   * **공유 링크로 들어온 경우(`initial`)는 건드리지 않는다.** 그 주소가
   * 가리키는 견적이 정본이다 (§8A.3).
   */
  useEffect(() => {
    if (phase.current === "live") return;
    const draft = loadDraft();
    if (draft === null) {
      // 적어둔 것이 없다. 이제부터 쓴다.
      phase.current = "live";
      return;
    }
    loadCode(draft, { restored: true });
    // 마운트 때 한 번만 본다. `loadCode`는 안정된 참조다.
  }, [loadCode]);

  const choose = useCallback(
    (slot: SlotName, id: string) => {
      const next = { ...selection };
      // 메모리·스토리지는 **덧붙인다** (`lib/multi-slot.ts`).
      if (isMultiSlot(slot)) {
        next[slot] = addToSlot(next[slot] ?? [], id, maxForSlot(slot));
      } else next[slot] = id;
      setOpenSlot(null);
      apply(next);
    },
    [selection, apply],
  );

  /**
   * 견적서에서 고른 것들을 한 번에 넣는다 (ADR-0018).
   *
   * **한 번만 갱신한다.** 슬롯마다 `choose`를 부르면 요청이 일곱 번 나가고
   * 그중 늦게 온 것이 이긴다 — 마지막 하나만 들어간 것처럼 보인다.
   */
  const applyQuote = useCallback(
    (picks: readonly QuotePick[]) => {
      const next = { ...selection };
      for (const p of picks) {
        if (isMultiSlot(p.slot)) {
          next[p.slot] = addToSlot(next[p.slot] ?? [], p.id, maxForSlot(p.slot));
        } else next[p.slot] = p.id;
      }
      setOpenSlot(null);
      apply(next);
    },
    [selection, apply],
  );

  const clear = useCallback(
    (slot: SlotName, id?: string) => {
      const next = { ...selection };
      // 메모리·스토리지는 여럿일 수 있다. 어느 것을 뺄지 받는다.
      if (isMultiSlot(slot)) next[slot] = removeFromSlot(next[slot] ?? [], id);
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

      {/*
        * 말없이 채우면 사용자는 부품이 왜 들어 있는지 모른다. 불러왔다고 적고
        * 비울 길을 같이 준다. `alert`이 아니라 `status`다 — 문제가 아니다.
        */}
      {restored && picked > 0 && (
        <p
          role="status"
          className="flex flex-wrap items-baseline justify-between gap-2 rounded-(--radius-card) border border-border bg-surface-2 px-4 py-2.5 text-sm"
        >
          <span className="text-fg-muted">
            지난번 하던 견적을 이어서 엽니다. 이 브라우저에만 남아 있습니다.
          </span>
          <button type="button" onClick={startOver} className="btn btn-ghost px-2 py-1 text-xs">
            비우고 새로 시작
          </button>
        </p>
      )}

      {/*
        * 견적서를 이미 들고 온 사람이 많다. 일곱 칸을 손으로 채우게 하지 않는다.
        * 판정 띠 바로 아래에 둔다 — 부품을 넣기 전에 보여야 쓸모가 있다.
        * 부품을 고른 뒤에도 접힌 채로 남긴다. 한 번 숨기면 다시 열 길이 없다.
        */}
      <QuoteBox onApply={applyQuote} />

      {loadError && (
        <p role="alert" className="verdict-bar verdict-warning text-sm">
          부품 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요. 고른
          구성은 그대로 있습니다.
        </p>
      )}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-6">
        <section
          aria-labelledby="slots-heading"
          className="card overflow-hidden"
        >
          <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-2.5">
            <h2 id="slots-heading" className="text-sm font-semibold">
              부품 선택
            </h2>
            {/* 칸 수를 센다. 부품 수를 쓰면 메모리 여러 묶음에서 분자가 분모를 넘는다 */}
            <span className="text-xs text-fg-subtle tnum">
              {filledSlotCount(build)} / {SLOT_META.length}
            </span>
          </div>

          <ul className="divide-y divide-border">
            {SLOT_META.map((meta) => (
              <SlotRow
                key={meta.slot}
                slot={meta.slot}
                category={meta.category}
                label={meta.label}
                picked={pickedIn(build, meta)}
                constraints={pickerConstraints(build, meta.slot)}
                full={
                  isMultiSlot(meta.slot) &&
                  partsInSlot(build, meta.slot).length >= maxForSlot(meta.slot)
                }
                open={openSlot === meta.slot}
                onToggle={() =>
                  setOpenSlot(openSlot === meta.slot ? null : meta.slot)
                }
                onChoose={(id) => choose(meta.slot, id)}
                onClear={(id) => clear(meta.slot, id)}
              />
            ))}
          </ul>
        </section>

        {/* 판정에 딸린 것만 옆에 둔다. 보관·공유는 아래로 내려 왼쪽 아래가
            비지 않게 한다 — 빈 칸이 크면 화면이 미완성으로 보인다 (ADR-0015) */}
        <aside className="space-y-4 lg:sticky lg:top-20">
          <PowerPanel build={build} />
          <ElectricityPanel build={build} />
          <FitPanel build={build} />
          <VerdictPanel verdict={verdict} build={build} />
        </aside>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {anySelected && <ShareBox code={code} />}
        <SaveBox
          code={code}
          defaultLabel={buildLabel(build)}
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

  const est = estimatePower({
    cpuW,
    gpuW,
    ramModules: modules,
    storageCount: build.storage.length,
    cooler: build.cooler,
  });
  const psuW = build.psu?.wattage ?? null;
  const left = describeExcluded(est.excluded);

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

      {/*
        * 빠진 부품을 말한다. 조용히 빼면 사용자는 합계가 전부인 줄 아는데,
        * 그러면 이 구간은 실제보다 낮다 (§7.4, 이슈 #5).
        */}
      {left !== null && (
        <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-fg-subtle">
          {left}
        </p>
      )}
    </section>
  );
}

function SlotRow({
  slot,
  category,
  label,
  picked,
  constraints,
  full,
  open,
  onToggle,
  onChoose,
  onClear,
}: {
  slot: SlotName;
  category: string;
  label: string;
  /** 이 칸에 들어 있는 부품들. 메모리만 여럿일 수 있다 */
  picked: readonly PickedPart[];
  constraints: readonly Constraint[];
  /** 더 담을 수 없는가 (메모리 묶음 상한) */
  full: boolean;
  open: boolean;
  onToggle: () => void;
  onChoose: (id: string) => void;
  /** id를 주면 그것만, 안 주면 전부 뺀다 */
  onClear: (id?: string) => void;
}) {
  const many = isMultiSlot(slot);
  /*
   * 메모리·스토리지는 **덧붙인다.** 그래서 이미 있어도 「변경」이 아니라 「추가」다.
   * 바꾸려면 빼고 넣는다 — 그편이 무엇이 들어 있는지 분명하다.
   */
  const actionLabel = open ? "닫기" : picked.length === 0 ? "선택" : many ? "추가" : "변경";

  /*
   * ★ 고르기를 닫거나 부품을 빼면 초점을 이 줄로 돌려놓는다 (WCAG 2.4.3).
   *
   * 고르기 목록이 사라지거나 누른 「제거」 버튼이 사라지면 초점이 페이지 맨 위로
   * 떨어졌다. 키보드 사용자는 슬롯 하나를 고를 때마다 처음부터 다시 탭해야 했다.
   *
   * **초점을 뺏지 않는다.** 이 줄에서 시작한 동작이고, 초점이 실제로 사라졌을 때만
   * 돌려놓는다 — 그사이 사용자가 다른 곳으로 옮겼으면 건드리지 않는다.
   */
  const rowRef = useRef<HTMLLIElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const clearRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const andReturnFocus =
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A) => {
      returnFocus.current = true;
      fn(...args);
    };
  useEffect(() => {
    if (!returnFocus.current || open) return;
    const active = document.activeElement;
    if (active && active !== document.body) {
      // 아직 이 줄 안에 있으면(제거 버튼이 사라지기 전) 기다린다. 밖이면 손 뗀다
      if (!rowRef.current?.contains(active)) returnFocus.current = false;
      return;
    }
    // 메모리·스토리지가 가득 차면 「추가」가 꺼진다. 그때는 「제거」로 간다
    const target = toggleRef.current && !toggleRef.current.disabled ? toggleRef.current : clearRef.current;
    target?.focus();
    returnFocus.current = false;
  });

  return (
    <li ref={rowRef} className={open ? "bg-surface-2" : ""}>
      {/* 카드 더미가 아니라 표의 한 줄이다. 한 화면에 더 많이 들어간다 (ADR-0015) */}
      <div className="row-grid px-3 py-2 sm:px-4">
        {/* 넓은 화면에서는 두 칸으로 펼치고(contents), 좁으면 쌓인다 */}
        <div className="min-w-0 sm:contents">
          <span className="flex items-center gap-2 text-xs font-medium text-fg-muted">
            {/* 제품 사진이 없으므로 아이콘이 시각적 닻 노릇을 한다 */}
            <PartIcon category={category} className="text-fg-subtle" />
            <span className="truncate">{label}</span>
            {/* 몇 묶음인지 말하지 않으면 둘째 줄이 왜 있는지 알 수 없다 */}
            {many && picked.length > 1 && (
              <span className="shrink-0 text-fg-subtle tnum">×{picked.length}</span>
            )}
          </span>
          <span className="min-w-0 text-sm">
            {picked.length === 0 ? (
              <span className="text-fg-subtle">아직 고르지 않음</span>
            ) : (
              <span className="block space-y-0.5">
                {picked.map((p) => (
                  <span key={p.id} className="flex min-w-0 items-baseline gap-1.5">
                    {p.href ? (
                      <Link href={p.href} className="link min-w-0 truncate font-medium">
                        {p.name}
                      </Link>
                    ) : (
                      <span className="min-w-0 truncate font-medium">{p.name}</span>
                    )}
                    {/* 묶음이 여럿이면 줄마다 뺄 수 있어야 한다 */}
                    {many && picked.length > 1 && (
                      <button
                        type="button"
                        onClick={andReturnFocus(() => onClear(p.id))}
                        aria-label={`${p.name} 제거`}
                        className="btn btn-ghost shrink-0 px-1.5 py-0.5 text-xs"
                      >
                        제거
                      </button>
                    )}
                  </span>
                ))}
              </span>
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
            ref={toggleRef}
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={`${label} ${actionLabel}`}
            disabled={!open && full}
            className={
              picked.length > 0
                ? "btn btn-ghost px-2 py-1 text-xs disabled:opacity-40"
                : "btn btn-secondary px-2.5 py-1 text-xs disabled:opacity-40"
            }
          >
            {actionLabel}
          </button>
          {picked.length > 0 && (
            <button
              ref={clearRef}
              type="button"
              // 인자 없이 부르면 이 칸을 비운다. 빈 문자열을 넘기면 아무것도
              // 걸러지지 않아 「전부 제거」가 조용히 실패한다.
              onClick={andReturnFocus(() => onClear())}
              aria-label={`${label} ${many && picked.length > 1 ? "전부 " : ""}제거`}
              className="btn btn-ghost px-2 py-1 text-xs"
            >
              {many && picked.length > 1 ? "전부 제거" : "제거"}
            </button>
          )}
        </span>
      </div>
      {open && (
        <PartPicker
          slot={slot}
          constraints={constraints}
          onChoose={andReturnFocus(onChoose)}
          onClose={andReturnFocus(onToggle)}
        />
      )}
    </li>
  );
}

function PartPicker({
  slot,
  constraints,
  onChoose,
  onClose,
}: {
  slot: SlotName;
  /** 이미 고른 부품에서 나온 제약. 비어 있으면 전체를 보여준다 (ADR-0016) */
  constraints: readonly Constraint[];
  onChoose: (id: string) => void;
  /** Esc로 닫는다. 열 때 쓴 버튼으로 손이 돌아가지 않게 */
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<PartOption[]>([]);
  const [hidden, setHidden] = useState(0);
  /** 조건에 맞는 전체 건수. 30개만 보여주면서 그게 전부인 척하지 않는다 */
  const [matched, setMatched] = useState(0);
  /** 지금 몇 개까지 불러왔나. 「더 보기」가 늘린다 */
  const [limit, setLimit] = useState(PAGE);
  /** 한글을 무엇으로 바꿔 찾았는지 (ADR-0017). 말하지 않으면 왜 나왔는지 모른다 */
  const [translated, setTranslated] = useState<readonly { from: string; to: string }[]>([]);
  /** 뜻을 모르는 한글. 결과가 0건인 이유가 이것이면 그렇다고 말한다 */
  const [unknown, setUnknown] = useState<readonly string[]>([]);
  const [narrow, setNarrow] = useState(true);
  const [failed, setFailed] = useState(false);
  const [loading, startSearch] = useTransition();
  /**
   * 방향키로 짚고 있는 항목. 짚은 것이 없으면 -1.
   *
   * 초점은 **입력칸에 그대로 둔다** (`aria-activedescendant` 패턴). 항목으로
   * 초점을 옮기면 계속 타이핑할 수 없고, 글자마다 목록이 바뀌는 이 화면에서는
   * 초점이 사라진 항목에 남는 일이 생긴다.
   */
  const [cursor, setCursor] = useState(NO_CURSOR);
  const listRef = useRef<HTMLUListElement>(null);

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
        // 목록이 바뀌면 짚은 자리를 놓는다. 그대로 두면 다른 부품을 고르게 된다.
        setCursor(NO_CURSOR);
        setHidden(result.data.hidden);
        setMatched(result.data.matched);
        setTranslated(result.data.translated);
        setUnknown(result.data.unknown);
      }
    },
    [],
  );

  const run = useCallback(
    (q: string, cons: readonly Constraint[], take: number) => {
      const my = ++seq.current;
      // 새 요청을 보내는 순간 옛 건수를 지운다. 안 그러면 새 이유 옆에
      // 옛 제약의 숫자가 잠깐 붙는다.
      setHidden(0);
      startSearch(async () => {
        apply(my, await searchParts(slot, q, cons, take));
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
      apply(my, await searchParts(slot, query, active, limit));
    });
    // query는 입력 때마다 run()이 직접 처리한다. 여기서 보면 글자마다 두 번 돈다.
    // constraints는 내용이 같으면 같은 key가 되므로 배열 대신 key를 본다.
    // 취소는 seq가 맡는다 — effect 안의 플래그로는 run()이 보낸 요청을 못 막는다.
    // limit은 「더 보기」가 올린다 — 그 경로도 이 effect를 타야 다음 30개가 온다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, narrow, key, limit]);

  const reasons = [...new Set(constraints.map((c) => c.because))];

  const listId = `picker-list-${slot}`;
  const optionId = (i: number) => `picker-opt-${slot}-${i}`;

  /**
   * 방향키로 목록을 훑고 Enter로 고른다.
   *
   * 검색창에 치고 나서 마우스로 옮겨 잡아야 했다. 이 화면은 한 번에 일곱 번
   * 쓰는 곳이라 그 왕복이 계속 생긴다.
   *
   * **초점은 입력칸에 그대로 둔다.** 항목으로 옮기면 계속 타이핑할 수 없다.
   * 대신 `aria-activedescendant`로 짚은 항목을 알린다 (WAI-ARIA combobox).
   */
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (options.length === 0) return;

    if (e.key === "Enter" && cursor >= 0) {
      e.preventDefault();
      const picked = options[cursor];
      if (picked) onChoose(picked.id);
      return;
    }

    const next = nextCursor(e.key, cursor, options.length);
    // 우리 키가 아니면 손대지 않는다. preventDefault를 하면 브라우저의
    // 기본 동작(글자 이동 등)이 사라진다.
    if (next === null) return;
    e.preventDefault();
    setCursor(next);
    // 짚은 것이 화면 밖이면 스크롤한다. 안 하면 방향키가 먹지 않는 것처럼 보인다.
    listRef.current?.querySelector(`#${optionId(next)}`)?.scrollIntoView({ block: "nearest" });
  };

  return (
    <div className="border-t border-border bg-surface-2 px-3 py-3 sm:px-4">
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          // 검색어가 바뀌면 처음 30개부터 다시 본다. 안 그러면 한 글자 칠 때마다
          // 300건을 끌어온다.
          setLimit(PAGE);
          run(e.target.value, active, PAGE);
        }}
        onKeyDown={onKeyDown}
        placeholder="모델명·한글 이름으로 검색 (라이젠, 지포스 5080)"
        aria-label="부품 검색"
        role="combobox"
        aria-expanded
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={cursor >= 0 ? optionId(cursor) : undefined}
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

      {/*
        * 몇 개 중 몇 개인지 말한다. 2,677개 중 30개를 보여주면서 그게 전부인
        * 것처럼 두면, 사용자는 찾는 것이 없다고 판단하고 그만둔다.
        */}
      {!loading && !failed && matched > options.length && (
        <p className="mt-2 text-xs text-fg-subtle">
          <span className="tnum">{matched.toLocaleString()}</span>개 중{' '}
          <span className="tnum">{options.length}</span>개
        </p>
      )}

      {/*
        * 상태 문장은 목록 **밖**에 둔다. `role="listbox"` 안에는 option만
        * 들어가야 한다 — "찾는 중…"이 항목처럼 읽히면 몇 개가 있는지 헷갈린다.
        */}
      <div aria-live="polite" className="empty:hidden">
        {loading && <p className="mt-2 px-1 text-sm text-fg-subtle">찾는 중…</p>}
        {/* "결과 없음"과 "불러오지 못함"은 사용자가 할 행동이 다르다. */}
        {!loading && failed && (
          <p className="mt-2 px-1 text-sm text-warn">
            부품 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </p>
        )}
        {!loading && !failed && options.length === 0 && (
          <p className="mt-2 px-1 text-sm text-fg-subtle">
            결과가 없습니다.
            {narrow && hidden > 0 && ' 「맞는 것만 보기」를 끄면 더 나옵니다.'}
          </p>
        )}
      </div>

      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="검색 결과"
        className="mt-2 max-h-64 space-y-0.5 overflow-y-auto text-sm empty:hidden"
      >
        {!loading &&
          !failed &&
          options.map((o, i) => (
            /*
             * 항목은 `role="option"`이라 초점을 받지 않는다. 그래서 button이
             * 아니라 li가 직접 클릭을 받는다 — button을 option으로 만들면
             * 스크린리더가 두 가지로 읽는다.
             */
            <li
              key={o.id}
              id={optionId(i)}
              role="option"
              aria-selected={cursor === i}
              onClick={() => onChoose(o.id)}
              className={`cursor-pointer rounded-(--radius-control) px-2 py-1.5 hover:bg-surface ${
                cursor === i ? "option-active" : ""
              }`}
            >
              <span className="block truncate">{o.name}</span>
              {(o.brand || o.releaseYear) && (
                <span className="mt-0.5 block text-xs text-fg-subtle">
                  {o.brand ?? ""}
                  {o.releaseYear ? ` · ${o.releaseYear}년` : ""}
                </span>
              )}
            </li>
          ))}
      </ul>

      {/* 목록 뒤에 둔다. 여기까지 내려온 사람이 다음 것을 찾고 있다 */}
      {!loading && !failed && matched > options.length && (
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE)}
          className="btn btn-secondary mt-1.5 w-full py-1.5 text-xs"
        >
          더 보기
        </button>
      )}

      {/* 상한에 닿으면 왜 더 안 나오는지 말한다. 말없이 멈추면 고장으로 보인다 */}
      {!loading && !failed && matched > options.length && options.length >= MAX_LIMIT && (
        <p className="mt-2 text-xs text-fg-subtle">
          한 번에 <span className="tnum">{MAX_LIMIT}</span>개까지 봅니다. 검색어를 더 적어
          보세요.
        </p>
      )}
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

/**
 * 결과가 가리키는 필드 목록. **부품별로 묶는다** — 필드마다 긴 부품 이름을 되풀이하면
 * 한 줄이 모바일에서 여섯 줄을 넘는다 (이슈 #46). 부품마다 링크 하나다.
 */
function FieldList({
  build,
  refs,
}: {
  build: Build | undefined;
  refs: readonly FieldRef[];
}) {
  return groupFieldsByPart(refs).map((g, i) => {
    const text = `${g.part}의 ${g.fields.join("·")}`;
    const href = partHref(build, g.slug);
    return (
      <span key={g.slug ?? g.part}>
        {i > 0 && ", "}
        {href ? (
          <Link href={href} className="link">
            {text}
          </Link>
        ) : (
          text
        )}
      </span>
    );
  });
}

/** slug로 부품의 카테고리를 되찾는다. 상세 페이지 주소를 만들려면 둘 다 필요하다. */
function partHref(
  build: Build | undefined,
  slug: string | undefined,
): string | null {
  if (!build || !slug) return null;
  for (const meta of SLOT_META) {
    const candidates = partsInSlot(build, meta.slot);
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
      <span className="text-sm tnum">{countsText(counts)}</span>
      {waiting.length > 0 && (
        <span className="verdict-aside text-xs">
          {listWithJosa(
            waiting.map((x) => SLOT_LABELS[x]),
            "을",
            "를",
          )}{" "}
          아직 고르지 않음
        </span>
      )}
      {pending && <span className="verdict-aside ml-auto text-xs">갱신 중…</span>}
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
        <>
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
          {/*
            * 「판정 불가」를 결함으로 읽지 않게 하는 곳이 따로 있다.
            * 결과가 나온 뒤에는 자리가 빠듯하니 빈 화면에서만 건넨다.
            */}
          <p className="mt-3 text-xs leading-relaxed text-fg-subtle">
            각 검사가 쓰는 데이터가 얼마나 비어 있는지도{' '}
            <Link href="/rules" className="link">
              공개합니다
            </Link>
            .
          </p>
        </>
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
                        {/* 판정 불가를 만난 사람이 그 값을 아는 경우가 있다.
                            거기서 제보로 이어지는 것이 가장 값싼 보강 경로다 (§5.5). */}
                        <FieldList build={build} refs={r.reason.fields} />
                        {r.reason.fields.some((f) =>
                          partHref(build, f.slug),
                        ) && (
                          <span className="ml-1">
                            — 아는 값이 있으면 알려주세요
                          </span>
                        )}
                      </p>
                    )}
                    {/*
                      우리가 스스로 의심한다고 표시해 둔 값으로 확정적인 판정을
                      내놓지 않는다 (이슈 #13). 판정은 그대로 두고 근거의 상태를
                      덧붙인다 — 값이 없는 것과 다투어지는 것은 다르다.
                    */}
                    {r.contested && (
                      <p className="mt-1 text-xs leading-relaxed text-warn">
                        검증 중인 값으로 판정했습니다:{" "}
                        <FieldList build={build} refs={r.contested} />
                        <span className="ml-1">
                          — 같은 제품의 다른 기록과 값이 다르거나 오류 신고가
                          들어온 항목입니다
                        </span>
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

  /*
   * 지운 줄의 「삭제」가 사라지면 초점이 페이지 맨 위로 떨어졌다 (WCAG 2.4.3).
   * 같은 자리(다음 줄, 없으면 앞 줄)의 「삭제」로, 다 지웠으면 「저장」으로 간다.
   */
  const listRef = useRef<HTMLUListElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const focusIndexAfterDelete = useRef<number | null>(null);
  useEffect(() => {
    const at = focusIndexAfterDelete.current;
    if (at === null) return;
    focusIndexAfterDelete.current = null;
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-delete]") ?? [];
    const target = buttons[Math.min(at, buttons.length - 1)] ?? saveButtonRef.current;
    target?.focus();
  }, [builds]);

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
          ref={saveButtonRef}
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
          <ul ref={listRef} className="mt-1.5 space-y-0.5">
            {builds.map((b, i) => (
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
                  data-delete
                  onClick={() => {
                    focusIndexAfterDelete.current = i;
                    removeBuild(b.code);
                  }}
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
