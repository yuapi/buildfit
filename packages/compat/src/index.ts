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
  Build,
} from './parts';

export { emptyBuild } from './parts';

export type { PowerConstants } from './power';
export {
  POWER_CONSTANTS,
  PCIE_SLOT_POWER_W,
  PSU_HEADROOM_MULTIPLIER,
  TIGHT_FIT_RATIO,
} from './power';

export type { Rule } from './rules';
export { rule1, rule2, rule3, rule4, rule5, rule6, rule7, rule8, phase0Rules } from './rules';

export type { FieldRequirement } from './requirements';
export {
  PHASE0_REQUIREMENTS,
  REQUIREMENT_CATEGORIES,
  requiredKeysFor,
  rulesBlockedBy,
  MOBO_FORM_FACTORS,
  PSU_FORM_FACTORS,
  MEMORY_TYPES,
} from './requirements';

export { evaluate } from './engine';
