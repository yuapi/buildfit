/**
 * 판정 결과 헬퍼와 집계.
 *
 * `summarize`의 `info`는 화면이 「문제」를 `fail - info`로 세는 근거다 (이슈 #83).
 * 정보 등급을 `info`로 따로 세지 않으면 규칙 12의 「Flashback으로 올릴 수 있다」가
 * 문제로 보인다 — 엔진 테스트는 정상 견적만 봐서 `info`가 늘 0이었다.
 */

import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/engine';
import {
  fail, inconsistent, isFilled, missing, outOfRange, pass, summarize, unknown,
} from '../src/verdict';
import * as f from './fixtures';

describe('summarize', () => {
  it('정보 등급 실패는 fail에 들고 info로 따로 센다', () => {
    const v = summarize([
      pass(1, 'ok'),
      fail(2, 'error', 'x'),
      fail(3, 'warning', 'y'),
      fail(12, 'info', 'z'),
      missing(4, '?', [{ part: 'GPU', field: '길이' }]),
    ]);
    expect(v.counts).toEqual({ pass: 1, fail: 3, info: 1, unknown: 1 });
  });

  it('통과·판정 불가는 등급이 info여도 info로 세지 않는다', () => {
    // pass와 unknown은 severity가 'info'로 만들어진다. 그것까지 세면 문제 수가 음수가 된다
    const v = summarize([pass(1, 'ok'), unknown(2, '?', { kind: 'missing', fields: [] })]);
    expect(v.counts.info).toBe(0);
    expect(v.counts.fail - v.counts.info).toBe(0);
  });

  it('결과가 없으면 전부 0이고 결과를 그대로 싣는다', () => {
    const v = summarize([]);
    expect(v.counts).toEqual({ pass: 0, fail: 0, info: 0, unknown: 0 });
    expect(v.results).toEqual([]);
  });
});

describe('엔진의 정보 등급 집계 (이슈 #83)', () => {
  it('규칙 12의 Flashback 안내는 info 1이고 문제로 세지 않는다', () => {
    const v = evaluate(
      f.withBuild({ motherboard: { ...f.motherboard, releaseYear: 2022, biosFlashback: true } }),
    );
    const r12 = v.results.find((r) => r.ruleId === 12);
    expect(r12?.verdict).toBe('fail');
    expect(r12?.severity).toBe('info');
    expect(v.counts.info).toBe(1);
    expect(v.counts.fail - v.counts.info).toBe(0);
  });

  it('Flashback이 없으면 경고라 info가 아니다', () => {
    const v = evaluate(
      f.withBuild({ motherboard: { ...f.motherboard, releaseYear: 2022, biosFlashback: false } }),
    );
    expect(v.counts.info).toBe(0);
    expect(v.counts.fail).toBe(1);
  });
});

describe('판정 불가 헬퍼', () => {
  const fields = [{ part: 'PSU', field: '8핀' }] as const;

  it('빈 notes는 싣지 않는다 — 화면이 빈 목록을 그리지 않게', () => {
    expect(unknown(8, '?', { kind: 'missing', fields }, [])).not.toHaveProperty('notes');
    expect(unknown(8, '?', { kind: 'missing', fields }, ['a']).notes).toEqual(['a']);
  });

  it('사유의 종류를 가른다', () => {
    expect(missing(8, '?', fields).reason?.kind).toBe('missing');
    expect(outOfRange(15, '?', '120슬롯', fields).reason).toEqual({
      kind: 'out-of-range', detail: '120슬롯', fields,
    });
    expect(inconsistent(8, '?', '0핀', fields).reason).toEqual({
      kind: 'inconsistent', detail: '0핀', fields,
    });
  });

  it('isFilled — 공백 문자열·빈 배열은 결측, 0·false는 값', () => {
    expect(isFilled(undefined)).toBe(false);
    expect(isFilled(' ')).toBe(false);
    expect(isFilled([])).toBe(false);
    expect(isFilled(0)).toBe(true);
    expect(isFilled(false)).toBe(true);
    expect(isFilled([0])).toBe(true);
  });
});
