/**
 * 치수 여유를 실척 막대로 보여준다 — `docs/research/product-image-sources.md` §6.
 *
 * 제품 사진은 "이 조합이 맞는가"에 거의 기여하지 않는다. RTX 5080 사진을 봐도
 * 케이스에 들어가는지 알 수 없다. 대신 **이미 가진 치수 데이터**를 실척으로
 * 그린다. 라이선스 문제가 없고, "빠듯함"을 문장으로 읽는 것보다 빠르다.
 *
 * **여기 쓰는 색은 판정 결과다** (ADR-0014). 장식이 아니다.
 */

export type FitTone = 'ok' | 'tight' | 'over';

/**
 * 여유 판정. **막대가 규칙보다 더 말하지 않게** 따로 뺀다.
 *
 * `tightRatio`는 규칙마다 다르다. 규칙 4는 95%를 빠듯함으로 알리고,
 * 규칙 9는 빠듯함을 알리지 않는다 (docs/compat-rules.md §9.3). 호출부가 건넨다.
 */
export function fitTone(valueMm: number, limitMm: number, tightRatio: number): FitTone {
  if (valueMm > limitMm) return 'over';
  // 경계는 들어가는 쪽이다. 규칙 4·9의 판정과 같은 방향으로 맞춘다.
  return valueMm > limitMm * tightRatio ? 'tight' : 'ok';
}

export interface FitBarProps {
  readonly label: string;
  /** 부품 치수 (mm) */
  readonly valueMm: number;
  /** 케이스 한계 (mm) */
  readonly limitMm: number;
  /** 한계 대비 이 비율을 넘으면 빠듯함으로 본다. 규칙 4의 TIGHT_FIT_RATIO */
  readonly tightRatio?: number;
  readonly unit?: string;
}

export function FitBar({
  label,
  valueMm,
  limitMm,
  tightRatio = 0.95,
  unit = 'mm',
}: FitBarProps) {
  if (!(limitMm > 0) || !(valueMm > 0)) return null;

  const tone0 = fitTone(valueMm, limitMm, tightRatio);
  const over = tone0 === 'over';
  const tight = tone0 === 'tight';
  // 넘치는 경우 막대가 칸을 벗어나야 "넘쳤다"가 보인다. 100%에서 잘라버리면
  // 딱 맞는 것과 구분되지 않는다.
  const scale = over ? limitMm / valueMm : valueMm / limitMm;
  const fillPct = Math.min(100, Math.max(2, (over ? 1 : scale) * 100));
  const limitPct = over ? scale * 100 : 100;

  const tone = over ? 'danger' : tight ? 'warn' : 'ok';
  const fill =
    tone === 'danger' ? 'bg-danger' : tone === 'warn' ? 'bg-warn' : 'bg-ok';
  const text =
    tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-ok';
  const slack = limitMm - valueMm;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-fg-muted">{label}</span>
        <span className={`tnum ${text}`}>
          {over
            ? `${Math.abs(slack)}${unit} 초과`
            : tight
              ? `여유 ${slack}${unit} — 빠듯함`
              : `여유 ${slack}${unit}`}
        </span>
      </div>

      {/* 막대 자체는 그림이므로 스크린리더에서 숨기고, 위 문장이 같은 사실을 말한다 */}
      <div className="relative mt-1.5 h-2 rounded-full bg-surface-2" aria-hidden>
        <div className={`h-2 rounded-full ${fill}`} style={{ width: `${fillPct}%` }} />
        {/* 케이스 한계 눈금. 넘친 경우 막대 중간에 선이 선다 */}
        <span
          className="absolute top-[-3px] h-[14px] w-px bg-fg-subtle"
          style={{ left: `${limitPct}%` }}
        />
      </div>

      <div className="mt-1 flex items-baseline justify-between gap-2 text-[0.6875rem] text-fg-subtle tnum">
        <span>
          {valueMm}
          {unit}
        </span>
        <span>
          한계 {limitMm}
          {unit}
        </span>
      </div>
    </div>
  );
}
