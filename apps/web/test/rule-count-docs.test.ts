/**
 * 문서가 말하는 규칙 수가 실제와 같다.
 *
 * 규칙 24를 더할 때 CLAUDE.md·README의 「19개」를 고치지 않아 한동안 틀린 수가 남았다.
 * 화면(`/rules`)은 규칙 목록에서 수를 세어 「20가지」라고 했는데 문서는 19였다.
 * 붙여넣기 상자의 「일곱 칸」(이슈 #46)과 같은 일이다 — 손으로 적은 수는 낡는다.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RULE_SUMMARY } from '@buildfit/compat';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const count = Object.keys(RULE_SUMMARY).length;

describe('문서의 규칙 수', () => {
  it.each([
    ['CLAUDE.md', /규칙은 이제 (\d+)개가 돈다/],
    ['README.md', /호환성 규칙 \| \*\*(\d+)개 동작\*\*/],
  ])('%s가 실제 규칙 수와 같다', (file, pattern) => {
    const m = pattern.exec(readFileSync(`${ROOT}/${file}`, 'utf8'));
    expect(m, `${file}에서 규칙 수 문장을 찾지 못했다 — 문장을 바꿨다면 이 검사도 고친다`).not.toBeNull();
    expect(Number(m![1])).toBe(count);
  });
});
