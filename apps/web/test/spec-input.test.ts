/**
 * 어드민·제보 입력 검사 — 저장 전에 무엇을 막는가.
 *
 * **이 자리가 테스트 없이는 조용히 틀린다.** `requirements.ts`가 못 박아둔 것:
 *
 * > `options`가 있으면 자유 입력을 막아야 한다. 규칙 5·6은 이 값들을 문자열
 * > 완전 일치로 비교하므로, 오타 하나가 판정을 뒤집는다.
 *
 * 화면은 `SpecValueField` 한 벌로 맞춰 두었지만 **서버 동작은 화면 없이도
 * 불릴 수 있다.** 그래서 서버에서 다시 검사한다.
 */

import { SPEC_REQUIREMENTS, type FieldRequirement } from '@buildfit/compat';
import { describe, expect, it } from 'vitest';
import { parseSourceUrl, parseSpecValue } from '../src/lib/spec-input';

function reqFor(category: string, specKey: string): FieldRequirement {
  const r = SPEC_REQUIREMENTS.find((q) => q.category === category && q.specKey === specKey);
  if (!r) throw new Error(`${category}.${specKey} 선언이 없다`);
  return r;
}

const psuFormFactors = reqFor('PCCase', 'supported_psu_form_factors'); // string[] + options
const maxGpuLength = reqFor('PCCase', 'max_gpu_length_mm'); // number
const socket = reqFor('CPU', 'socket'); // 자유 문자열
const moboFormFactor = reqFor('Motherboard', 'form_factor'); // string + options

describe('출처 URL', () => {
  it('빈 값을 막는다 — 출처 없이 저장하면 재검증이 처음부터다 (§5.5)', () => {
    for (const bad of ['', '   ', null, undefined]) {
      expect(parseSourceUrl(bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it('http/https만 받는다', () => {
    expect(parseSourceUrl('https://example.com/a').ok).toBe(true);
    expect(parseSourceUrl('http://example.com/a').ok).toBe(true);
    // javascript:는 화면에 링크로 나가는 값이다
    expect(parseSourceUrl('javascript:alert(1)').ok).toBe(false);
    expect(parseSourceUrl('data:text/html,x').ok).toBe(false);
    expect(parseSourceUrl('file:///etc/passwd').ok).toBe(false);
    expect(parseSourceUrl('example.com').ok).toBe(false);
  });

  it('앞뒤 공백을 떼어 저장한다', () => {
    const r = parseSourceUrl('  https://example.com/a  ');
    expect(r.ok && r.value).toBe('https://example.com/a');
  });
});

describe('숫자 항목', () => {
  it('0과 음수는 값이 아니다 — 원본의 0이 거짓 통과를 만든다 (§8.4)', () => {
    expect(parseSpecValue(maxGpuLength, ['0']).ok).toBe(false);
    expect(parseSpecValue(maxGpuLength, ['-1']).ok).toBe(false);
  });

  it('숫자가 아니면 막는다', () => {
    for (const bad of ['', '  ', 'abc', '330mm', 'NaN', 'Infinity']) {
      expect(parseSpecValue(maxGpuLength, [bad]).ok, bad).toBe(false);
    }
  });

  it('소수를 받는다 — 두께 2.5슬롯 같은 값이 실재한다', () => {
    const r = parseSpecValue(maxGpuLength, ['330.5']);
    expect(r.ok && r.value).toBe(330.5);
  });
});

describe('예/아니오 항목', () => {
  const includesCooler = SPEC_REQUIREMENTS.find((r) => r.valueType === 'boolean');

  it('빈 값을 false로 넘기지 않는다 — "모름"과 "아니오"는 다른 사실이다', () => {
    if (!includesCooler) return;
    expect(parseSpecValue(includesCooler, ['']).ok).toBe(false);
    expect(parseSpecValue(includesCooler, []).ok).toBe(false);
    // 트루시 문자열도 받지 않는다
    expect(parseSpecValue(includesCooler, ['1']).ok).toBe(false);
    expect(parseSpecValue(includesCooler, ['yes']).ok).toBe(false);
  });

  it('true/false만 받는다', () => {
    if (!includesCooler) return;
    expect(parseSpecValue(includesCooler, ['true'])).toEqual({ ok: true, value: true });
    expect(parseSpecValue(includesCooler, ['false'])).toEqual({ ok: true, value: false });
  });
});

describe('★ 허용값이 있는 항목은 그 값만 받는다', () => {
  it('목록 밖의 값을 막는다 (여러 개)', () => {
    expect(parseSpecValue(psuFormFactors, ['ATX', 'SFX']).ok).toBe(true);
    // 오타 하나가 규칙 6의 문자열 비교를 깬다
    expect(parseSpecValue(psuFormFactors, ['atx']).ok).toBe(false);
    expect(parseSpecValue(psuFormFactors, ['ATX 파워']).ok).toBe(false);
    expect(parseSpecValue(psuFormFactors, [' ATX']).ok).toBe(true); // 공백은 떼고 본다
    // 하나만 틀려도 전부 막는다. 일부만 저장하면 무엇이 저장됐는지 알 수 없다
    expect(parseSpecValue(psuFormFactors, ['ATX', 'ATX2']).ok).toBe(false);
  });

  it('목록 밖의 값을 막는다 (하나)', () => {
    expect(parseSpecValue(moboFormFactor, ['Micro ATX']).ok).toBe(true);
    expect(parseSpecValue(moboFormFactor, ['micro atx']).ok).toBe(false);
    expect(parseSpecValue(moboFormFactor, ['mATX']).ok).toBe(false);
  });

  it('빈 선택을 막는다', () => {
    expect(parseSpecValue(psuFormFactors, []).ok).toBe(false);
    expect(parseSpecValue(psuFormFactors, ['', '  ']).ok).toBe(false);
  });

  it('같은 것을 두 번 담지 않는다', () => {
    const r = parseSpecValue(psuFormFactors, ['ATX', 'ATX', 'SFX']);
    expect(r.ok && r.value).toEqual(['ATX', 'SFX']);
  });

  it('선언된 모든 허용값이 통과한다 — 목록과 검사가 어긋나면 채울 수 없다', () => {
    for (const req of SPEC_REQUIREMENTS) {
      if (!req.options) continue;
      for (const option of req.options) {
        expect(
          parseSpecValue(req, [option]).ok,
          `${req.category}.${req.specKey}의 허용값 "${option}"이 막혔다`,
        ).toBe(true);
      }
    }
  });
});

describe('자유 문자열 항목', () => {
  it('빈 값을 막고 공백을 떼어 저장한다', () => {
    expect(parseSpecValue(socket, ['   ']).ok).toBe(false);
    const r = parseSpecValue(socket, ['  AM5 ']);
    expect(r.ok && r.value).toBe('AM5');
  });
});
