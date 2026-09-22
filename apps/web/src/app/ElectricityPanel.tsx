"use client";

/**
 * 전기요금 — 명세 §2.1 (★ 최우선 차별점).
 *
 * **PC 전력만 따로 곱하면 의미가 없다.** 한국 주택용은 누진 구간이 있어서, 같은
 * 사용량이 붙어도 가구가 얼마를 쓰던 집인지에 따라 추가 요금이 갈린다. 그래서
 * 가구 월 사용량을 묻는다.
 *
 * 요율표와 출처: `docs/research/kepco-tariff.md`. 계산은 `@buildfit/compat`의
 * 순수 함수다 — 화면과 판정이 같은 코드를 쓴다.
 */

import {
  KEPCO_RESIDENTIAL_LOW_VOLTAGE as TARIFF,
  type Build,
  type Season,
  addedElectricityCost,
  describeTariffExcluded,
  estimatePower,
  monthlyKwh,
  seasonOf,
} from "@buildfit/compat";
import { useId, useState, useSyncExternalStore } from "react";
import {
  getServerStorageSnapshot,
  getStorageSnapshot,
  savePrefs,
  subscribeStorage,
} from "@/lib/storage";

const SEASON_LABEL: Readonly<Record<Season, string>> = {
  summer: "하계 (7·8월)",
  winter: "동계 (12·1·2월)",
  other: "기타계절",
};

export function ElectricityPanel({ build }: { build: Build }) {
  const householdId = useId();
  const hoursId = useId();
  /*
   * localStorage는 React 바깥의 스토어다. effect + setState로 끌어오면 연쇄
   * 렌더와 hydration 불일치가 생긴다 (`lib/storage.ts`의 스냅샷 주석).
   */
  const { prefs } = useSyncExternalStore(
    subscribeStorage,
    getStorageSnapshot,
    getServerStorageSnapshot,
  );
  /*
   * 저장된 값이 **초기값**이다. 타이핑 중에는 이쪽이 이기고, 저장은 blur에서만
   * 한다 — 한 글자마다 저장하면 「3」을 지우는 순간 3kWh가 저장된다.
   */
  const [household, setHousehold] = useState<string | null>(null);
  const [hours, setHours] = useState<string | null>(null);
  const [season, setSeason] = useState<Season>(() => seasonOf(new Date()));

  const householdText = household ?? (prefs.householdKwh === null ? "" : String(prefs.householdKwh));
  const hoursText = hours ?? (prefs.pcHoursPerDay === null ? "" : String(prefs.pcHoursPerDay));

  const cpuW = build.cpu ? (build.cpu.ppt ?? build.cpu.tdp) : null;
  const gpuW = build.gpu?.tdp ?? null;
  if (cpuW === null && gpuW === null) return null;

  const est = estimatePower({
    cpuW,
    gpuW,
    ramModules: build.ram.reduce((n, k) => n + (k.moduleCount ?? 0), 0),
    storageCount: build.storage.length,
  });

  const householdKwh = Number(householdText);
  const hoursPerDay = Number(hoursText);
  const ready =
    householdText.trim() !== "" &&
    hoursText.trim() !== "" &&
    Number.isFinite(householdKwh) &&
    Number.isFinite(hoursPerDay) &&
    householdKwh > 0 &&
    hoursPerDay > 0;

  // 소비전력이 구간이므로 요금도 구간이다 (ADR-0004).
  const low = ready
    ? addedElectricityCost({
        baselineKwh: householdKwh,
        addedKwh: monthlyKwh({ watts: est.minW, hoursPerDay }),
        season,
      })
    : null;
  const high = ready
    ? addedElectricityCost({
        baselineKwh: householdKwh,
        addedKwh: monthlyKwh({ watts: est.maxW, hoursPerDay }),
        season,
      })
    : null;

  const remember = (patch: { householdKwh?: number; pcHoursPerDay?: number }) => {
    // 저장 실패는 정상 경로다 (§8A.4). 계산은 그대로 된다.
    savePrefs(patch);
  };

  return (
    <section className="card p-4 sm:p-5" aria-labelledby="bill-heading">
      <h2 id="bill-heading" className="text-sm font-semibold">
        전기요금
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
        누진 구간 때문에 <strong className="font-medium text-fg-muted">가구가 평소 얼마를
        쓰는지</strong>에 따라 추가 요금이 갈립니다. PC 사용량만 따로 곱한 값은 실제와
        다릅니다.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={householdId} className="block text-xs text-fg-muted">
            평소 가구 월 사용량
          </label>
          <div className="mt-1 flex items-baseline gap-1.5">
            <input
              id={householdId}
              type="number"
              inputMode="numeric"
              min={1}
              max={100000}
              value={householdText}
              onChange={(e) => setHousehold(e.target.value)}
              onBlur={() => {
                const n = Number(householdText);
                if (Number.isFinite(n) && n > 0) remember({ householdKwh: n });
              }}
              placeholder="300"
              className="field w-24 tnum"
            />
            <span className="text-sm text-fg-muted">kWh</span>
          </div>
        </div>
        <div>
          <label htmlFor={hoursId} className="block text-xs text-fg-muted">
            PC를 하루에
          </label>
          <div className="mt-1 flex items-baseline gap-1.5">
            <input
              id={hoursId}
              type="number"
              inputMode="numeric"
              min={0.5}
              max={24}
              step={0.5}
              value={hoursText}
              onChange={(e) => setHours(e.target.value)}
              onBlur={() => {
                const n = Number(hoursText);
                if (Number.isFinite(n) && n > 0) remember({ pcHoursPerDay: n });
              }}
              placeholder="4"
              className="field w-24 tnum"
            />
            <span className="text-sm text-fg-muted">시간</span>
          </div>
        </div>
      </div>

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

      {low === null || high === null ? (
        <p className="mt-4 border-t border-border pt-3 text-sm text-fg-subtle">
          두 칸을 채우면 추가 요금을 계산합니다.
        </p>
      ) : (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs text-fg-muted">PC 때문에 더 내는 금액 (월)</p>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="stat text-3xl">{Math.round(low.addedWon).toLocaleString("ko-KR")}</span>
            <span className="text-fg-subtle">~</span>
            <span className="stat text-3xl">{Math.round(high.addedWon).toLocaleString("ko-KR")}</span>
            <span className="text-sm text-fg-muted">원</span>
          </p>

          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-fg-muted">PC 사용량</dt>
              <dd className="tnum">
                {monthlyKwh({ watts: est.minW, hoursPerDay }).toFixed(0)}~
                {monthlyKwh({ watts: est.maxW, hoursPerDay }).toFixed(0)} kWh
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-fg-muted">합산 후 월 사용량</dt>
              <dd className="tnum">
                {low.after.kwh.toFixed(0)}~{high.after.kwh.toFixed(0)} kWh
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-fg-muted">1kWh 더 쓸 때</dt>
              <dd className="tnum">{high.marginalWonPerKwh}원</dd>
            </div>
          </dl>

          {/*
            * 구간 상승이 이 기능의 핵심이다 (§2.1). 색만으로 구분하지 않고
            * 글자로도 말한다 (ADR-0014).
            */}
          {high.tierRose && (
            <p className="mt-3 rounded-(--radius-control) border border-warn-border bg-warn-bg p-2.5 text-sm">
              <span className="font-medium">누진 구간이 올라갑니다.</span> 이 PC를 더하면
              가구 사용량이 {low.before.kwh.toFixed(0)}kWh에서{" "}
              {high.after.kwh.toFixed(0)}kWh로 올라 단가가{" "}
              {high.before.marginalWonPerKwh}원에서 {high.marginalWonPerKwh}원이 됩니다.
            </p>
          )}
          {high.after.superUser && (
            <p className="mt-2 rounded-(--radius-control) border border-danger-border bg-danger-bg p-2.5 text-sm">
              <span className="font-medium">슈퍼유저요금 구간입니다.</span> 하계·동계에
              1,000kWh를 넘으면 초과분에 {TARIFF.summer.energy[3]?.wonPerKwh}원/kWh가 붙습니다.
            </p>
          )}

          <p className="mt-3 text-xs leading-relaxed text-fg-subtle">
            {describeTariffExcluded()}
          </p>
        </div>
      )}

      <p className="mt-3 text-xs leading-relaxed text-fg-subtle">
        주택용 저압 기준 · {TARIFF.checkedOn} 확인 ·{" "}
        <a href={TARIFF.source.url} target="_blank" rel="noreferrer" className="link">
          {TARIFF.source.label}
        </a>
        . 단가는 예고 없이 개정됩니다.
      </p>
    </section>
  );
}
