/**
 * 스펙 값을 어떤 칸으로 받는가.
 *
 * **목록이 있는 항목을 자유 입력으로 받으면 제보가 쓸모없어진다.** 규칙 5·6은
 * 값을 글자 그대로 비교하므로 `atx`·`ATX 파워` 같은 것은 못 읽는다
 * (`requirements.ts`의 `options` 주석).
 *
 * 실제로 공개 제보 폼이 전부 자유 입력이었다. 어드민은 지키고 있었는데
 * 한쪽만 보고 있어서 드러나지 않았다 — 케이스 데이터가 이 프로젝트의 가장 큰
 * 결측인데(규칙 6 판정 불가 84.5%) 그 보강 경로가 헛돌고 있었다.
 */

import { SPEC_REQUIREMENTS, type FieldRequirement } from '@buildfit/compat';
import { describe, expect, it } from 'vitest';
import { specFieldKind } from '../src/components/SpecValueField';

const find = (category: string, specKey: string): FieldRequirement => {
  const req = SPEC_REQUIREMENTS.find((r) => r.category === category && r.specKey === specKey);
  if (!req) throw new Error(`${category}.${specKey} 선언이 없다`);
  return req;
};

describe('선언이 칸 모양을 정한다', () => {
  it('★ 목록이 있으면 절대 자유 입력이 아니다', () => {
    for (const req of SPEC_REQUIREMENTS) {
      if (!req.options) continue;
      expect(
        specFieldKind(req),
        `${req.category}.${req.specKey}는 목록이 있는데 자유 입력이다`,
      ).not.toBe('text');
    }
  });

  it('여러 개를 고르는 항목은 체크박스다', () => {
    // 케이스의 지원 파워 폼팩터가 그렇다. 하나만 고르게 하면 ATX+SFX를 못 적는다.
    expect(specFieldKind(find('PCCase', 'supported_psu_form_factors'))).toBe('multi');
    expect(specFieldKind(find('PCCase', 'supported_mobo_form_factors'))).toBe('multi');
  });

  it('하나만 고르는 항목은 select다', () => {
    expect(specFieldKind(find('PSU', 'form_factor'))).toBe('select');
    expect(specFieldKind(find('Motherboard', 'form_factor'))).toBe('select');
    expect(specFieldKind(find('RAM', 'ram_type'))).toBe('select');
  });

  it('숫자 항목은 숫자칸이다', () => {
    expect(specFieldKind(find('PCCase', 'max_cpu_cooler_height_mm'))).toBe('number');
    expect(specFieldKind(find('GPU', 'length_mm'))).toBe('number');
  });

  it('참·거짓 항목은 예/아니오다', () => {
    expect(specFieldKind(find('Motherboard', 'bios_flashback'))).toBe('boolean');
  });

  it('목록이 없는 글자 항목만 자유 입력이다', () => {
    expect(specFieldKind(find('CPU', 'socket'))).toBe('text');
  });

  it('★ 모든 선언이 어떤 칸이든 가진다', () => {
    // 새 `valueType`을 더하고 칸을 안 만들면 여기서 걸린다.
    const kinds = new Set(['boolean', 'multi', 'select', 'number', 'text']);
    for (const req of SPEC_REQUIREMENTS) {
      expect(kinds.has(specFieldKind(req)), `${req.category}.${req.specKey}`).toBe(true);
    }
  });
});

describe('두 화면이 같은 칸을 쓴다', () => {
  it('★ 어드민과 공개 제보 폼이 같은 컴포넌트를 쓴다', async () => {
    // 한쪽만 고치면 또 갈라진다. 실제로 그래서 이 결함이 생겼다.
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = fileURLToPath(new URL('../src', import.meta.url));
    for (const file of [
      `${src}/app/admin/parts/[id]/SpecForm.tsx`,
      `${src}/app/part/[category]/[slug]/ReportForm.tsx`,
    ]) {
      expect(readFileSync(file, 'utf8'), file).toContain('SpecValueField');
    }
  });
});
