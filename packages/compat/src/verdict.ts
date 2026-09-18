/**
 * 판정 결과 계약.
 *
 * ADR-0009: 규칙 평가 결과는 boolean이 아니라 3값이다.
 * 결측을 통과로 처리하면 사용자가 "호환 확인됨"을 보고 안 맞는 부품을 산다.
 *
 * 명세: docs/compat-rules.md §0
 */

/** 규칙 하나의 평가 결과. */
export type Verdict = 'pass' | 'fail' | 'unknown';

/** `fail`일 때의 표시 등급. `pc-builder-spec.md` §4.3 */
export type Severity = 'error' | 'warning' | 'info';

/** 판정하지 못한 필드. 사용자에게 그대로 보여준다. */
export interface FieldRef {
  /** 부품 표시명. 예: "NZXT H5 Flow" */
  readonly part: string;
  /** 사람이 읽는 필드 이름. 예: "케이스 지원 PSU 폼팩터" */
  readonly field: string;
}

/**
 * `unknown`의 사유. docs/compat-rules.md §0.2의 세 유형.
 *
 * `inconsistent`가 특히 중요하다. OpenDB에는 미입력을 0으로 채운 레코드가 실재하며
 * (RTX 40/50 중 166건), 0은 결측 검사를 통과해 거짓 pass를 만든다.
 */
export type UnknownReason =
  | { readonly kind: 'missing'; readonly fields: readonly FieldRef[] }
  | { readonly kind: 'inconsistent'; readonly detail: string; readonly fields: readonly FieldRef[] }
  | { readonly kind: 'out-of-range'; readonly detail: string; readonly fields: readonly FieldRef[] };

export interface RuleResult {
  /** `pc-builder-spec.md` §4.1 / §4.2의 규칙 번호. 표시 순서도 이 순서다. */
  readonly ruleId: number;
  readonly verdict: Verdict;
  /** `fail`일 때 적용할 등급. `pass`/`unknown`에서는 표시에 쓰지 않는다. */
  readonly severity: Severity;
  /** 사용자에게 보여줄 한국어 문장. */
  readonly message: string;
  /** `unknown`일 때만 채운다. */
  readonly reason?: UnknownReason;
  /**
   * 보조 검사를 건너뛴 경우 그 사유.
   * 규칙 2에서 CPU 쪽 결측이 전체를 unknown으로 만들지 않되,
   * 건너뛰었다는 사실은 남긴다. docs/compat-rules.md §2
   */
  readonly skipped?: readonly string[];
}

/** 견적 하나에 대한 전체 판정. */
export interface BuildVerdict {
  readonly results: readonly RuleResult[];
  readonly counts: {
    readonly pass: number;
    readonly fail: number;
    readonly unknown: number;
  };
}

// --- 생성 헬퍼 -------------------------------------------------------------

export function pass(ruleId: number, message: string): RuleResult {
  return { ruleId, verdict: 'pass', severity: 'info', message };
}

export function fail(ruleId: number, severity: Severity, message: string): RuleResult {
  return { ruleId, verdict: 'fail', severity, message };
}

export function unknown(ruleId: number, message: string, reason: UnknownReason): RuleResult {
  return { ruleId, verdict: 'unknown', severity: 'info', message, reason };
}

/** 필요한 필드가 비어 있어 판정하지 못한 경우. */
export function missing(ruleId: number, message: string, fields: readonly FieldRef[]): RuleResult {
  return unknown(ruleId, message, { kind: 'missing', fields });
}

/** 값은 있으나 다른 필드와 물리적으로 양립 불가한 경우. docs/compat-rules.md §8.4 */
export function inconsistent(
  ruleId: number,
  message: string,
  detail: string,
  fields: readonly FieldRef[],
): RuleResult {
  return unknown(ruleId, message, { kind: 'inconsistent', detail, fields });
}

/**
 * 결과 집계.
 *
 * 요약에서 "모든 검사 통과"라고 쓰지 않는다. 통과 n / 판정 불가 m으로 나눈다.
 * ADR-0009
 */
export function summarize(results: readonly RuleResult[]): BuildVerdict {
  let p = 0;
  let f = 0;
  let u = 0;
  for (const r of results) {
    if (r.verdict === 'pass') p += 1;
    else if (r.verdict === 'fail') f += 1;
    else u += 1;
  }
  return { results, counts: { pass: p, fail: f, unknown: u } };
}

/** 값이 판정에 쓸 수 있는 상태인가. `null`·`undefined`·빈 배열·빈 문자열은 결측이다. */
export function isFilled(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  return true;
}
