/**
 * @buildfit/compat — 호환성 규칙 엔진
 *
 * ADR-0010: 이 패키지는 Next.js·DB·프레임워크 API에 의존하지 않는다.
 * 입력은 부품 객체, 출력은 RuleResult다. 클라이언트와 서버가 같은 코드를 쓴다.
 *
 * 규칙 명세: docs/compat-rules.md
 */

export type {
  Verdict,
  Severity,
  FieldRef,
  UnknownReason,
  RuleResult,
  BuildVerdict,
} from './verdict';

export { pass, fail, unknown, missing, inconsistent, summarize, isFilled } from './verdict';

export type {
  PartRef,
  Cpu,
  Motherboard,
  RamKit,
  Gpu,
  GpuConnectors,
  PcCase,
  Psu,
  PsuConnectors,
  CpuCooler,
  Build,
} from './parts';

export { emptyBuild } from './parts';

export type { PowerRange, PowerSource, PowerAssumptions, PowerEstimate } from './power';
export {
  POWER_ASSUMPTIONS,
  describeAssumptions,
  estimatePower,
  PCIE_SLOT_POWER_W,
  PSU_HEADROOM_MULTIPLIER,
  TIGHT_FIT_RATIO,
} from './power';

export type { CaseReference, PsuFormFactorObservation } from './case-reference';
export {
  CASE_PSU_REFERENCE,
  CASE_REFERENCE_SOURCE,
  MIN_SAMPLE_TO_CITE,
  describeCaseReference,
} from './case-reference';

export type { PartSlot, NotApplicable } from './applicability';
export {
  RULE_PARTS,
  RULE_SUMMARY,
  SLOT_LABELS,
  notApplicable,
  blockingSlots,
} from './applicability';

export type { Constraint } from './picker';
export { pickerConstraints } from './picker';

export type { KoAlias, Term, SearchTerms } from './search';
export { KO_ALIASES, OMITTED_ALIASES, squash, searchTerms, isImpossible } from './search';

export type { QuoteLabel, QuoteLine, QuoteOptions } from './quote';
export { QUOTE_LABELS, readQuoteLine } from './quote';

export type { Rule } from './rules';
export {
  rule1,
  rule2,
  rule3,
  rule4,
  rule5,
  rule6,
  rule7,
  rule8,
  rule9,
  rule12,
  rule15,
  rule16,
  phase0Rules,
  phase1Rules,
} from './rules';

export type { FieldRequirement } from './requirements';
export {
  SPEC_REQUIREMENTS,
  REQUIREMENT_CATEGORIES,
  requiredKeysFor,
  rulesBlockedBy,
  MOBO_FORM_FACTORS,
  PSU_FORM_FACTORS,
  MEMORY_TYPES,
} from './requirements';

export { evaluate } from './engine';
