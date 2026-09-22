"use client";

/**
 * 전력·전기요금 단독 계산기 — 명세 §8 `/calc/power`, §2.1.
 *
 * 견적 없이 쓴다. 이미 가진 PC나, 소비전력만 아는 기기의 추가 요금을 본다.
 *
 * **입력은 명세 §2.1 그대로다**: 평소 가구 월 사용량 + 사용 패턴(게임 n시간/일,
 * 아이들 m시간). 견적 화면은 부품에서 소비전력을 추정하지만 여기는 견적이 없으므로
 * **두 줄 모두 사용자가 W를 넣는다.** 아이들 전력을 우리가 가정하지 않는다 —
 * 근거 없는 수치를 만들지 않는다. 아이들 줄은 비워 둬도 된다.
 *
 * 가구 사용량은 견적 화면과 **같은 저장값**을 쓴다 (ADR-0005, add-only — 새 필드를
 * 만들지 않는다). 한 번 넣으면 두 화면이 같이 기억한다.
 */

import { type Season, seasonOf } from "@buildfit/compat";
import { useId, useState, useSyncExternalStore } from "react";
import { BillResult, SEASON_LABEL, TariffSource } from "@/components/BillResult";
import {
  getServerStorageSnapshot,
  getStorageSnapshot,
  savePrefs,
  subscribeStorage,
} from "@/lib/storage";
import { usageKwh } from "@/lib/usage";

function NumberField({
  id,
  label,
  unit,
  value,
  onChange,
  onBlur,
  placeholder,
  step,
}: {
  readonly id: string;
  readonly label: string;
  readonly unit: string;
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly onBlur?: () => void;
  readonly placeholder: string;
  readonly step?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs text-fg-muted">
        {label}
      </label>
      <div className="mt-1 flex items-baseline gap-1.5">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          className="field w-24 tnum"
        />
        <span className="text-sm text-fg-muted">{unit}</span>
      </div>
    </div>
  );
}

export function PowerCalculator() {
  const ids = {
    household: useId(),
    loadW: useId(),
    loadH: useId(),
    idleW: useId(),
    idleH: useId(),
  };
  const { prefs } = useSyncExternalStore(
    subscribeStorage,
    getStorageSnapshot,
    getServerStorageSnapshot,
  );

  // 저장값이 초기값이고, 타이핑 중에는 이쪽이 이긴다 (ElectricityPanel과 같은 이유)
  const [household, setHousehold] = useState<string | null>(null);
  const householdText =
    household ?? (prefs.householdKwh === null ? "" : String(prefs.householdKwh));

  const [loadW, setLoadW] = useState("");
  const [loadH, setLoadH] = useState("");
  const [idleW, setIdleW] = useState("");
  const [idleH, setIdleH] = useState("");
  const [season, setSeason] = useState<Season>(() => seasonOf(new Date()));

  const num = (s: string) => (s.trim() === "" ? 0 : Number(s));
  const baseline = Number(householdText);
  const baselineOk = householdText.trim() !== "" && Number.isFinite(baseline) && baseline > 0;
  const usage = usageKwh([
    { watts: num(loadW), hoursPerDay: num(loadH) },
    { watts: num(idleW), hoursPerDay: num(idleH) },
  ]);

  return (
    <section className="card p-4 sm:p-5" aria-labelledby="calc-heading">
      <h2 id="calc-heading" className="text-sm font-semibold">
        계산
      </h2>

      <div className="mt-3">
        <NumberField
          id={ids.household}
          label="평소 가구 월 사용량"
          unit="kWh"
          value={householdText}
          onChange={setHousehold}
          onBlur={() => {
            const n = Number(householdText);
            // 저장 실패는 정상 경로다 (§8A.4). 계산은 그대로 된다.
            if (Number.isFinite(n) && n > 0) savePrefs({ householdKwh: n });
          }}
          placeholder="300"
        />
        <p className="mt-1 text-xs text-fg-subtle">
          전기요금 고지서의 「사용량」입니다. 견적 화면과 같이 기억합니다.
        </p>
      </div>

      <fieldset className="mt-4">
        <legend className="text-xs font-medium text-fg-muted">게임·작업할 때</legend>
        <div className="mt-1 grid grid-cols-2 gap-3">
          <NumberField id={ids.loadW} label="소비전력" unit="W" value={loadW} onChange={setLoadW} placeholder="400" />
          <NumberField
            id={ids.loadH}
            label="하루에"
            unit="시간"
            value={loadH}
            onChange={setLoadH}
            placeholder="4"
            step={0.5}
          />
        </div>
      </fieldset>

      <fieldset className="mt-3">
        <legend className="text-xs font-medium text-fg-muted">
          켜 두기만 할 때 <span className="font-normal text-fg-subtle">(선택)</span>
        </legend>
        <div className="mt-1 grid grid-cols-2 gap-3">
          <NumberField id={ids.idleW} label="소비전력" unit="W" value={idleW} onChange={setIdleW} placeholder="80" />
          <NumberField
            id={ids.idleH}
            label="하루에"
            unit="시간"
            value={idleH}
            onChange={setIdleH}
            placeholder="6"
            step={0.5}
          />
        </div>
        {/*
          * 아이들 전력은 PC마다 크게 다르다. 기본값을 채워 두지 않는다 —
          * 채우면 그 숫자가 사실처럼 계산에 들어간다.
          */}
        <p className="mt-1 text-xs text-fg-subtle">
          값은 PC마다 크게 다릅니다. 모르면 비워 두세요 — 채우지 않은 줄은 계산에 넣지 않습니다.
        </p>
      </fieldset>

      <fieldset className="mt-3">
        <legend className="text-xs text-fg-muted">계절</legend>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {(["other", "summer", "winter"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={season === s}
              onClick={() => setSeason(s)}
              className={`chip ${
                season === s ? "border-border-strong bg-surface-2 font-medium text-fg" : ""
              }`}
            >
              {SEASON_LABEL[s]}
            </button>
          ))}
        </div>
      </fieldset>

      {!baselineOk ? (
        <p className="mt-4 border-t border-border pt-3 text-sm text-fg-subtle">
          가구 월 사용량을 넣으면 계산합니다.
        </p>
      ) : !usage.ok ? (
        <p role="status" className="mt-4 border-t border-border pt-3 text-sm text-fg-subtle">
          {usage.message}
        </p>
      ) : (
        <BillResult
          baselineKwh={baseline}
          addedKwhLow={usage.kwh}
          addedKwhHigh={usage.kwh}
          season={season}
          subject="이 기기"
        />
      )}

      <TariffSource />
    </section>
  );
}
