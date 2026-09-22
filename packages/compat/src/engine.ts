/**
 * 규칙 엔진 진입점.
 *
 * ADR-0010: 이 모듈은 Next.js·DB에 의존하지 않는다.
 * 견적 편집 중 즉시 판정(클라이언트)과 /build/:hash SSR 결과(서버)가 같은 코드를 쓴다.
 */

import type { Build, PartRef } from './parts';
import { SPEC_REQUIREMENTS } from './requirements';
import { phase1Rules, type Rule } from './rules';
import { type BuildVerdict, type FieldRef, type RuleResult, summarize } from './verdict';

/**
 * 카테고리별로 견적에 든 부품.
 *
 * 규칙↔필드 대응(`SPEC_REQUIREMENTS`)이 카테고리로 적혀 있으므로 그 축으로 모은다.
 * 카테고리 이름은 OpenDB 디렉터리명이다.
 */
function partsByCategory(build: Build): ReadonlyMap<string, readonly PartRef[]> {
  const out = new Map<string, readonly PartRef[]>();
  const put = (category: string, items: readonly (PartRef | null)[]): void => {
    const kept = items.filter((p): p is PartRef => p !== null);
    if (kept.length > 0) out.set(category, kept);
  };
  put('CPU', [build.cpu]);
  put('Motherboard', [build.motherboard]);
  put('RAM', build.ram);
  put('GPU', [build.gpu]);
  put('PCCase', [build.pcCase]);
  put('PSU', [build.psu]);
  put('CPUCooler', [build.cooler]);
  put('Storage', build.storage);
  return out;
}

/**
 * 판정이 쓴 값 중 검증 중인 것을 찾아 붙인다 — 이슈 #13.
 *
 * **규칙을 건드리지 않는다.** 규칙이 어떤 필드를 읽는지는 `SPEC_REQUIREMENTS`가
 * 이미 단일 진실 소스로 들고 있다. 14개 규칙에 손을 대면 하나를 빠뜨리게 되고,
 * 빠진 규칙은 조용히 확정적인 판정을 내놓는다.
 *
 * 보조 필드(`optional`)도 센다. 판정 불가를 만들지 않을 뿐, 답에는 영향을 준다 —
 * 규칙 2의 CPU 지원 메모리 규격이 그렇다.
 */
function withContested(
  result: RuleResult,
  byCategory: ReadonlyMap<string, readonly PartRef[]>,
): RuleResult {
  const found: FieldRef[] = [];
  for (const req of SPEC_REQUIREMENTS) {
    if (req.ruleId !== result.ruleId) continue;
    for (const part of byCategory.get(req.category) ?? []) {
      if (part.contestedSpecs?.includes(req.specKey) !== true) continue;
      // 같은 (부품, 필드)가 두 번 들어가지 않게 한다. 한 필드를 여러 규칙이
      // 쓰기도 하고, 선언에 fallback 행이 따로 있기도 하다.
      if (found.some((f) => f.part === part.name && f.field === req.label)) continue;
      found.push({ part: part.name, field: req.label, slug: part.slug });
    }
  }
  return found.length > 0 ? { ...result, contested: found } : result;
}

/**
 * 견적을 평가한다.
 *
 * 아직 고르지 않은 부품 때문에 적용할 수 없는 규칙은 결과에서 빠진다.
 * 판정에 필요한 데이터가 없는 경우는 빠지는 게 아니라 `unknown`으로 남는다 (ADR-0009).
 */
export function evaluate(build: Build, rules: readonly Rule[] = phase1Rules): BuildVerdict {
  const byCategory = partsByCategory(build);
  const results = rules
    .map((rule) => rule(build))
    .filter((r): r is RuleResult => r !== null)
    .map((r) => withContested(r, byCategory));
  return summarize(results);
}
