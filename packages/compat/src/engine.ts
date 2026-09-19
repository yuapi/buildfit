/**
 * 규칙 엔진 진입점.
 *
 * ADR-0010: 이 모듈은 Next.js·DB에 의존하지 않는다.
 * 견적 편집 중 즉시 판정(클라이언트)과 /build/:hash SSR 결과(서버)가 같은 코드를 쓴다.
 */

import type { Build } from './parts';
import { phase1Rules, type Rule } from './rules';
import { type BuildVerdict, summarize } from './verdict';

/**
 * 견적을 평가한다.
 *
 * 아직 고르지 않은 부품 때문에 적용할 수 없는 규칙은 결과에서 빠진다.
 * 판정에 필요한 데이터가 없는 경우는 빠지는 게 아니라 `unknown`으로 남는다 (ADR-0009).
 */
export function evaluate(build: Build, rules: readonly Rule[] = phase1Rules): BuildVerdict {
  const results = rules.map((rule) => rule(build)).filter((r) => r !== null);
  return summarize(results);
}
