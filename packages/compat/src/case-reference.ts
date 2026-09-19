/**
 * 케이스 form_factor별로 **관측된** 지원 PSU 폼팩터 분포.
 *
 * ADR-0013. 측정 절차와 표본 편향은
 * `docs/research/case-psu-formfactor-distribution.md`.
 *
 * 이 표는 판정에 쓰지 않는다. 판정 불가일 때 참고로만 덧붙인다.
 * 여기서 `pass`를 만들면 Mini ITX Tower에서 88% 거짓 통과가 난다.
 */

export interface PsuFormFactorObservation {
  readonly formFactor: string;
  readonly count: number;
}

export interface CaseReference {
  /** 그 form_factor 중 값이 채워져 있던 건수. 비율의 분모다. */
  readonly sampleSize: number;
  /** OpenDB의 해당 form_factor 총 건수. 표본이 얼마나 일부인지 보여준다. */
  readonly populationSize: number;
  readonly observations: readonly PsuFormFactorObservation[];
}

/** 출처. 수치를 화면에 낼 때 함께 표시한다. */
export const CASE_REFERENCE_SOURCE = {
  label: 'BuildCores OpenDB PCCase 전수 3,782건',
  url: 'https://github.com/buildcores/open-db',
  measuredAt: '2026-09-19',
} as const;

/**
 * 이 미만이면 인용하지 않는다.
 *
 * 4건의 100%는 401건의 99%보다 약한 근거인데 화면에서는 더 세 보인다.
 * ADR-0013 "표본 10건 미만을 버리는 이유"
 */
export const MIN_SAMPLE_TO_CITE = 10;

/**
 * 측정값. 키는 OpenDB `form_factor` 원문이다.
 *
 * 데이터가 0건인 폼팩터(HTPC, Micro ATX Desktop, ATX Desktop,
 * Micro ATX Slim Tower, 테스트벤치)는 아예 없다. 없는 것이 맞다.
 */
export const CASE_PSU_REFERENCE: Readonly<Record<string, CaseReference>> = {
  'ATX Mid Tower': {
    sampleSize: 401,
    populationSize: 2323,
    observations: [
      { formFactor: 'ATX', count: 397 },
      { formFactor: 'SFX', count: 4 },
      { formFactor: 'SFX-L', count: 4 },
    ],
  },
  'Micro ATX Mini Tower': {
    sampleSize: 56,
    populationSize: 396,
    observations: [
      { formFactor: 'ATX', count: 56 },
      { formFactor: 'SFX', count: 6 },
      { formFactor: 'SFX-L', count: 6 },
    ],
  },
  'ATX Full Tower': {
    sampleSize: 46,
    populationSize: 313,
    observations: [
      { formFactor: 'ATX', count: 46 },
      { formFactor: 'SFX', count: 2 },
      { formFactor: 'SFX-L', count: 2 },
    ],
  },
  'Micro ATX Mid Tower': {
    sampleSize: 31,
    populationSize: 214,
    observations: [
      { formFactor: 'ATX', count: 31 },
      { formFactor: 'SFX', count: 6 },
      { formFactor: 'SFX-L', count: 2 },
    ],
  },
  'EATX Full Tower': {
    sampleSize: 18,
    populationSize: 26,
    observations: [{ formFactor: 'ATX', count: 18 }],
  },
  'Mini ITX Tower': {
    sampleSize: 17,
    populationSize: 336,
    observations: [
      { formFactor: 'SFX', count: 14 },
      { formFactor: 'SFX-L', count: 14 },
      { formFactor: 'ATX', count: 2 },
      { formFactor: 'Flex ATX', count: 1 },
    ],
  },
  'EATX Mid Tower': {
    sampleSize: 13,
    populationSize: 30,
    observations: [{ formFactor: 'ATX', count: 13 }],
  },
  // 'ATX Mini Tower'는 표본 4건이라 싣지 않는다 (ADR-0013)
};

/**
 * 참고 문장 한 줄. 인용할 근거가 없으면 `null`.
 *
 * "이 케이스의 사양이 아니다"를 문장 안에 넣는다.
 * 옆에 작게 다는 주석은 읽히지 않는다.
 */
export function describeCaseReference(formFactor: string | null): string | null {
  if (formFactor === null) return null;
  const entry = CASE_PSU_REFERENCE[formFactor];
  if (!entry || entry.sampleSize < MIN_SAMPLE_TO_CITE) return null;

  const parts = entry.observations.map((o) => {
    const pct = Math.round((o.count / entry.sampleSize) * 100);
    return `${o.formFactor} ${o.count}건(${pct}%)`;
  });
  return (
    `참고: ${CASE_REFERENCE_SOURCE.label}에서 ${formFactor} 중 값이 확인된 ` +
    `${entry.sampleSize}건은 ${parts.join(', ')}이었습니다. ` +
    `이 케이스의 사양이 아니라 같은 폼팩터의 관측 분포입니다 ` +
    `(측정일 ${CASE_REFERENCE_SOURCE.measuredAt}).`
  );
}
