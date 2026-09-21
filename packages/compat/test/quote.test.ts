/**
 * 견적서 한 줄 읽기 — ADR-0018.
 *
 * 실측이 이 테스트의 근거다. 카탈로그의 진짜 이름 420건을 국내 판매 표기처럼
 * 흐트러뜨려 되찾게 했을 때 69.8%가 부품 하나로 확정됐고, **단일 오답은 0건**이었다
 * (`docs/research/quote-line-matching.md`).
 */

import { describe, expect, it } from 'vitest';
import { QUOTE_LABELS, readQuoteLine } from '../src/quote';

const terms = (line: string) => readQuoteLine(line).terms.map((t) => t.any.join('|'));

describe('줄 앞 이름표는 찾는 말이 아니라 어디서 찾을지를 말한다', () => {
  it('이름표를 조각으로 쓰지 않는다', () => {
    // 「CPU」를 조각으로 쓰면 이름에 cpu가 든 부품만 찾게 되어 줄이 통째로 빗나간다.
    const r = readQuoteLine('CPU: AMD 라이젠7 9800X3D');
    expect(r.label?.category).toBe('CPU');
    expect(terms('CPU: AMD 라이젠7 9800X3D')).toEqual(['amd', 'ryzen7', '9800x3d']);
  });

  it('구분자가 있어야 이름표다', () => {
    // 구분자 없이 앞 낱말만 보면 「Corsair …」의 첫 낱말도 이름표가 된다.
    expect(readQuoteLine('케이스 없는 그냥 문장').label).toBeNull();
    expect(readQuoteLine('[케이스] 리안리 O11').label?.category).toBe('PCCase');
    expect(readQuoteLine('케이스 - 리안리 O11').label?.category).toBe('PCCase');
  });

  it('★ 다루지 않는 부품은 "못 찾음"과 구분한다', () => {
    // 사용자가 할 행동이 다르다. "못 찾았다"는 다시 쳐보게 만들지만
    // "아직 다루지 않는다"는 그렇지 않다.
    const r = readQuoteLine('SSD: 삼성 990 PRO 2TB');
    expect(r.label?.category).toBeNull();
    expect(r.label?.label).toBe('스토리지');
  });
});

describe('부품 이름이 아닌 말은 버린다', () => {
  it('유통·포장 표기가 줄을 죽이지 않는다', () => {
    expect(terms('AMD 라이젠7 9800X3D (그래니트릿지) (멀티팩)')).toEqual([
      'amd',
      'ryzen7',
      '9800x3d',
    ]);
    expect(readQuoteLine('ASUS PRIME B650M-A II 대원씨티에스').ignored).toEqual(['대원씨티에스']);
  });

  it('검색창과 정책이 반대다 — 거기서는 모르는 한글이 0건을 만든다', () => {
    // 검색창은 사용자가 친 말이 전부 뜻이 있다고 본다 (ADR-0017 §5).
    // 견적서는 잡음이 섞여 있는 것이 정상이다.
    const r = readQuoteLine('리안리 O11 Dynamic 서린씨앤아이');
    expect(r.ignored).toEqual(['서린씨앤아이']);
    expect(terms('리안리 O11 Dynamic 서린씨앤아이')).toEqual(['lianli', 'o11', 'dynamic']);
  });

  it('★ 글자가 든 조각이 없으면 부품 줄이 아니다', () => {
    // 「합계 2,480,000원」은 숫자만 남아 480·000이 되는데,
    // 그걸로 찾으면 엉뚱한 부품이 줄줄이 나온다. 실제로 그랬다.
    expect(readQuoteLine('합계 2,480,000원').isPart).toBe(false);
    expect(readQuoteLine('수량 1개').isPart).toBe(false);
    expect(readQuoteLine('[견적서]').isPart).toBe(false);
    expect(readQuoteLine('').isPart).toBe(false);
    expect(readQuoteLine('AMD Ryzen 7 9800X3D').isPart).toBe(true);
  });

  it('타이핑 중 표기를 받지 않는다 — 견적서는 다 쓴 글이다', () => {
    // 검색창의 앞부분 일치를 그대로 쓰면 「개」가 「갤럭시」로 잡힌다.
    // 실제로 "수량 1개"가 GALAX 그래픽카드를 불렀다.
    expect(readQuoteLine('1개').ignored).toEqual(['개']);
    expect(terms('라이')).toEqual([]);
    expect(terms('라이젠')).toEqual(['ryzen']);
  });
});

describe('짧은 조각은 바로 앞에만 붙인다', () => {
  it('모델 접미사가 붙는다', () => {
    // `ti`는 혼자 두면 Edition·Multi 안에도 있다 (ADR-0017 §1).
    // 붙이면 반대로 정확해진다 — rtx4070ti는 담기고 rtx4070evoocedition은 안 담긴다.
    expect(terms('RTX 4070 Ti')).toEqual(['rtx', '4070ti']);
    expect(terms('Intel Core i5 12400')).toEqual(['intel', 'corei5', '12400']);
  });

  it('★ 사이에 버린 말이 끼면 붙이지 않는다', () => {
    // 「RTX 5080 게이밍 트리오 OC」에서 OC를 5080에 붙이면 5080oc가 되는데
    // 그런 이름은 없다. 줄 전체가 못 찾음이 된다.
    expect(terms('MSI 지포스 RTX 5080 게이밍 트리오 OC 16G')).toEqual([
      'msi',
      'geforce',
      'rtx',
      '5080',
      '16g',
    ]);
  });

  it('★ 한 조각에 두 번 붙이지 않는다', () => {
    // 「라이젠7-5세대」의 5까지 붙으면 ryzen75가 된다. 그런 것은 없다.
    expect(terms('AMD 라이젠7-5세대 9800X3D')).toEqual(['amd', 'ryzen7', '9800x3d']);
  });

  it('붙일 자리가 없으면 버린다', () => {
    // 혼자 남은 짧은 조각은 아무것도 가리지 못한다.
    expect(terms('Ti')).toEqual([]);
    expect(readQuoteLine('Ti').isPart).toBe(false);
  });

  it('끌 수 있다 — 실측 비교에 쓴 스위치다', () => {
    expect(readQuoteLine('RTX 4070 Ti', { mergeShort: false }).terms.map((t) => t.raw)).toEqual([
      'RTX',
      '4070',
    ]);
  });
});

describe('한글과 영문이 붙어 있으면 거기서 자른다', () => {
  it('라이젠7은 두 덩어리다', () => {
    expect(terms('라이젠7 9800X3D')).toEqual(['ryzen7', '9800x3d']);
    expect(terms('코어 울트라5 245K')).toEqual(['core', 'ultra5', '245k']);
  });
});

describe('이름표 사전 자체의 건전성', () => {
  it('한 낱말이 두 카테고리를 가리키지 않는다', () => {
    const seen = new Map<string, string>();
    for (const l of QUOTE_LABELS) {
      for (const w of l.words) {
        expect(seen.has(w), `${w}가 ${seen.get(w)}와 ${l.label} 둘 다에 있다`).toBe(false);
        seen.set(w, l.label);
      }
    }
  });

  it('낱말은 전부 소문자다 — 대조 전에 소문자로 바꾸기 때문이다', () => {
    for (const l of QUOTE_LABELS) {
      for (const w of l.words) expect(w).toBe(w.toLowerCase());
    }
  });
});
