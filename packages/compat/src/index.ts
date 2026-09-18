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

export {
  pass,
  fail,
  unknown,
  missing,
  inconsistent,
  summarize,
  isFilled,
} from './verdict';
