"use client";

/**
 * 전기요금 결과 — 견적 화면(`ElectricityPanel`)과 단독 계산기(`/calc/power`)가
 * **한 벌을 쓴다.**
 *
 * 누진 구간 상승 경고, 슈퍼유저 경고, 빠진 항목 고지, 요율표 확인 날짜가 여기
 * 있다. 두 화면이 따로 그리면 한쪽만 고치는 날 **같은 사용량에 다른 말**을 하게
 * 된다 — 특히 「이 계산은 실제 청구액보다 낮다」는 고지가 한쪽에서 빠지면
 * 그 화면은 근거 없이 정확해 보인다.
 *
 * 계산은 `@buildfit/compat`의 순수 함수다.
 */

import {
  KEPCO_RESIDENTIAL_LOW_VOLTAGE as TARIFF,
  type Season,
  addedElectricityCost,
  describeTariffExcluded,
} from "@buildfit/compat";

export const SEASON_LABEL: Readonly<Record<Season, string>> = {
  summer: "하계 (7·8월)",
  winter: "동계 (12·1·2월)",
  other: "기타계절",
};

const won = (n: number) => Math.round(n).toLocaleString("ko-KR");

/**
 * 추가 사용량은 **구간**으로 받는다. 견적 화면은 소비전력이 추정 구간이라 두 값이
 * 다르고(ADR-0004), 단독 계산기는 사용자가 W를 직접 넣어 두 값이 같다.
 * 같으면 「~」 없이 한 값으로 보여준다.
 */
export function BillResult({
  baselineKwh,
  addedKwhLow,
  addedKwhHigh,
  season,
  subject = "PC",
}: {
  readonly baselineKwh: number;
  readonly addedKwhLow: number;
  readonly addedKwhHigh: number;
  readonly season: Season;
  /** 무엇 때문에 더 내는지. 문구에만 쓴다 */
  readonly subject?: string;
}) {
  const low = addedElectricityCost({ baselineKwh, addedKwh: addedKwhLow, season });
  const high = addedElectricityCost({ baselineKwh, addedKwh: addedKwhHigh, season });
  const single = Math.round(low.addedWon) === Math.round(high.addedWon);
  const kwhRange =
    Math.round(addedKwhLow) === Math.round(addedKwhHigh)
      ? `${addedKwhHigh.toFixed(0)} kWh`
      : `${addedKwhLow.toFixed(0)}~${addedKwhHigh.toFixed(0)} kWh`;

  return (
    <div className="mt-4 border-t border-border pt-3">
      <p className="text-xs text-fg-muted">{subject} 때문에 더 내는 금액 (월)</p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className="stat text-3xl">{won(low.addedWon)}</span>
        {!single && (
          <>
            <span className="text-fg-subtle">~</span>
            <span className="stat text-3xl">{won(high.addedWon)}</span>
          </>
        )}
        <span className="text-sm text-fg-muted">원</span>
      </p>

      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-fg-muted">{subject} 사용량</dt>
          <dd className="tnum">{kwhRange}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-fg-muted">합산 후 월 사용량</dt>
          <dd className="tnum">
            {low.after.kwh.toFixed(0) === high.after.kwh.toFixed(0)
              ? `${high.after.kwh.toFixed(0)} kWh`
              : `${low.after.kwh.toFixed(0)}~${high.after.kwh.toFixed(0)} kWh`}
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
          <span className="font-medium">누진 구간이 올라갑니다.</span> {subject} 사용량을 더하면
          가구 사용량이 {low.before.kwh.toFixed(0)}kWh에서 {high.after.kwh.toFixed(0)}kWh로
          올라 단가가 {high.before.marginalWonPerKwh}원에서 {high.marginalWonPerKwh}원이
          됩니다.
        </p>
      )}
      {high.after.superUser && (
        <p className="mt-2 rounded-(--radius-control) border border-danger-border bg-danger-bg p-2.5 text-sm">
          <span className="font-medium">슈퍼유저요금 구간입니다.</span> 하계·동계에
          1,000kWh를 넘으면 초과분에 {TARIFF.summer.energy[3]?.wonPerKwh}원/kWh가 붙습니다.
        </p>
      )}

      <p className="mt-3 text-xs leading-relaxed text-fg-subtle">{describeTariffExcluded()}</p>
    </div>
  );
}

/** 요율표 출처와 확인 날짜. 두 화면 모두 결과 아래에 둔다 */
export function TariffSource() {
  return (
    <p className="mt-3 text-xs leading-relaxed text-fg-subtle">
      주택용 저압 기준 · {TARIFF.checkedOn} 확인 ·{" "}
      <a href={TARIFF.source.url} target="_blank" rel="noreferrer" className="link">
        {TARIFF.source.label}
      </a>
      . 단가는 예고 없이 개정됩니다.
    </p>
  );
}
