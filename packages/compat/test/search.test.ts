/**
 * 검색어 해석 — ADR-0017.
 *
 * 고치기 전 실측이 이 테스트의 출발점이다. 라이젠·지포스·삼성·에이수스는
 * 전부 0건이었고, `rtx 4070`은 273건인데 `rtx4070`은 0건이었다.
 */

import { describe, expect, it } from 'vitest';
import { KO_ALIASES, isImpossible, searchTerms, squash } from '../src/search';

/** 조각별 후보만 꺼낸다. 테스트가 읽히게 */
const alts = (q: string) => searchTerms(q).terms.map((t) => t.any);

describe('한글 표기를 카탈로그의 영문으로 바꾼다', () => {
  it('브랜드·제품군 이름이 걸린다', () => {
    expect(alts('라이젠')).toEqual([['ryzen']]);
    expect(alts('지포스')).toEqual([['geforce']]);
    expect(alts('라데온')).toEqual([['radeon']]);
    expect(alts('에이수스')).toEqual([['asus']]);
    expect(alts('삼성')).toEqual([['samsung']]);
  });

  it('표기가 갈리는 것은 둘 다 받는다', () => {
    expect(alts('써멀테이크')).toEqual(alts('서멀테이크'));
    expect(alts('아수스')).toEqual(alts('에이수스'));
  });

  it('무엇으로 바꿨는지 돌려준다 — 화면이 그대로 말한다', () => {
    expect(searchTerms('지포스 5080').translated).toEqual([{ from: '지포스', to: 'geforce' }]);
  });
});

describe('조각을 쪼개 전부 만족(AND)을 요구한다', () => {
  it('"지포스 5080"은 이름에 그대로 들어있지 않다', () => {
    // GeForce RTX 5080 → squash → geforcertx5080. 통째로는 안 걸린다.
    expect(squash('GeForce RTX 5080')).toContain('geforce');
    expect(squash('GeForce RTX 5080')).toContain('5080');
    expect(squash('GeForce RTX 5080')).not.toContain('geforce5080');
    expect(alts('지포스 5080')).toEqual([['geforce'], ['5080']]);
  });
});

describe('띄어쓰기와 하이픈을 지워 같은 모양으로 맞댄다', () => {
  it('rtx4070과 rtx 4070이 같은 것을 찾는다', () => {
    const name = squash('ASUS TUF Gaming GeForce RTX 4070');
    for (const term of alts('rtx4070').flat()) expect(name).toContain(term);
    for (const term of alts('rtx 4070').flat()) expect(name).toContain(term);
  });

  it('9800 x3d와 9800x3d가 같은 것을 찾는다', () => {
    const name = squash('AMD Ryzen 7 9800X3D');
    for (const term of alts('9800 x3d').flat()) expect(name).toContain(term);
    for (const term of alts('9800x3d').flat()) expect(name).toContain(term);
  });

  it('파트넘버의 하이픈도 지운다', () => {
    expect(alts('100-000001593WOF')).toEqual([['100000001593wof']]);
  });
});

describe('타이핑 중인 한글도 받는다', () => {
  // "라이젠"을 치는 동안 화면에 차례로 나타나는 모양들이다.
  // 하나라도 빗나가면 목록이 깜빡인다.
  it('앞부분만 쳐도 걸린다', () => {
    expect(alts('라이')).toEqual([['ryzen']]);
    expect(alts('지포')).toEqual([['geforce']]);
  });

  it('마지막 음절의 받침이 아직 안 붙었어도 걸린다', () => {
    // 「라이젠」의 직전 상태는 「라이제」다 (젠 = 제 + ㄴ).
    expect(alts('라이제')).toEqual([['ryzen']]);
    // 「기가바이트」의 직전 상태
    expect(alts('기가바이트')).toEqual([['gigabyte']]);
    expect(alts('에이수스')).toEqual([['asus']]);
  });

  it('조합 중 자모 하나도 앞부분으로 본다', () => {
    expect(alts('라이ㅈ')).toEqual([['ryzen']]);
  });

  it('앞부분이 갈리면 둘 다 후보로 둔다', () => {
    // 라이젠과 라데온은 첫 글자가 같다. 한쪽으로 단정하지 않는다.
    expect(alts('라')).toEqual([['ryzen', 'radeon']]);
  });

  it('받침 무시는 마지막 음절에서만 한다', () => {
    // 가운데까지 풀면 엉뚱한 것에 붙는다. "라이젠스"는 아무것도 아니다.
    expect(searchTerms('라이젠스').unknown).toEqual(['라이젠스']);
  });
});

describe('모르는 말을 조용히 버리지 않는다', () => {
  it('뜻을 모르는 한글이 섞이면 결과가 0건이 된다', () => {
    const t = searchTerms('다나와 5080');
    expect(t.unknown).toEqual(['다나와']);
    // 버리면 "5080 전부"가 된다. 그건 찾던 것이 아니다.
    expect(isImpossible(t)).toBe(true);
  });

  it('빈 검색어는 아무 조건도 만들지 않는다', () => {
    expect(searchTerms('').terms).toEqual([]);
    expect(searchTerms('   ').terms).toEqual([]);
    expect(isImpossible(searchTerms(''))).toBe(false);
  });

  it('기호만 친 조각은 조건이 되지 않는다', () => {
    // squash 뒤에 빈 문자열이면 like '%%'가 되어 전부 통과한다.
    expect(searchTerms('---').terms).toEqual([]);
    expect(alts('ryzen ---')).toEqual([['ryzen']]);
  });
});

describe('검토에서 잡힌 것', () => {
  it('★ 문자열이 아닌 것이 들어와도 던지지 않는다', () => {
    // Next의 `searchParams`는 `?q=a&q=b`면 배열을 준다. 그대로 `trim()`을
    // 부르면 던지고, 호출부의 try/catch가 "DB를 불러올 수 없습니다"로
    // **잘못 안내한다** — 원인과 문구가 어긋난다.
    for (const bad of [['a', 'b'], null, undefined, 42, {}, true]) {
      const t = searchTerms(bad as unknown as string);
      expect(t.terms, String(bad)).toEqual([]);
      expect(isImpossible(t)).toBe(false);
    }
  });
});

describe('사전 자체의 건전성', () => {
  it('영문 쪽은 이미 squash를 거친 모양이어야 한다', () => {
    // 아니면 카탈로그와 맞댈 때 어긋난다. `cooler master`는 절대 안 걸린다.
    for (const a of KO_ALIASES) expect(squash(a.en)).toBe(a.en);
  });

  it('한 표기가 두 영문을 가리키지 않는다', () => {
    const seen = new Map<string, string>();
    for (const a of KO_ALIASES) {
      for (const ko of a.ko) {
        expect(seen.has(ko), `${ko}가 ${seen.get(ko)}와 ${a.en} 둘 다에 있다`).toBe(false);
        seen.set(ko, a.en);
      }
    }
  });

  it('조각이 너무 짧으면 부분 일치가 쓸모없어진다', () => {
    // `ti`는 Edition·Multi 안에도 있다. 실측 151건 중 74건이 4070 Ti가 아니었다.
    // 그래서 뺐다. 이 경계를 낮추려면 그 실측을 다시 해야 한다.
    for (const a of KO_ALIASES) expect(a.en.length).toBeGreaterThanOrEqual(3);
  });
});
