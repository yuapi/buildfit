/**
 * 두 부품의 스펙을 나란히 맞춘다.
 *
 * **다른 항목을 앞으로 올린다.** 이 화면의 목적이 차이를 보는 것인데,
 * 키 이름 순으로 늘어놓으면 스펙 10개 중 2개가 표 가운데 묻힌다.
 *
 * 컴포넌트에서 떼어낸 이유는 순서 규칙을 테스트로 고정하려는 것이다.
 */

export interface SpecInput {
  readonly key: string;
  readonly value: unknown;
  readonly unit: string | null;
}

export interface CompareRow<T> {
  readonly key: string;
  readonly l: T | undefined;
  readonly r: T | undefined;
  /** 화면에 쓸 글자. 한쪽에 항목이 없으면 `null` */
  readonly lText: string | null;
  readonly rText: string | null;
  /** 둘 다 값이 있고 다르다 */
  readonly differs: boolean;
  /**
   * 한쪽 값이 없다 — **다른 것이 아니라 모르는 것이다** (이슈 #81). 「다름」으로 세면
   * 두 부품이 다르다는 근거 없이 차이를 주장한다. 측정값 절이 한쪽이 없을 때
   * 「비교하지 않습니다」라고 하는 것과 같은 기준이다.
   */
  readonly oneSided: boolean;
}

/** 줄 순서: 다름 → 비교 불가 → 같음. 차이를 먼저 보이되, 모르는 것을 차이 사이에 섞지 않는다 */
const rank = (row: { differs: boolean; oneSided: boolean }) => (row.differs ? 0 : row.oneSided ? 1 : 2);

/**
 * 한쪽에만 있는 항목도 빠뜨리지 않는다.
 *
 * 같은 값끼리의 순서는 **키 이름 순 그대로**다. 한 번 본 표를 다시 봤을 때
 * 순서가 바뀌어 있으면 무엇이 달라졌는지 알 수 없다.
 */
export function alignSpecs<T extends SpecInput>(
  left: readonly T[],
  right: readonly T[],
  text: (row: T) => string,
): CompareRow<T>[] {
  const byKeyL = new Map(left.map((s) => [s.key, s]));
  const byKeyR = new Map(right.map((s) => [s.key, s]));
  const keys = [...new Set([...byKeyL.keys(), ...byKeyR.keys()])].sort();

  return (
    keys
      .map((key) => {
        const l = byKeyL.get(key);
        const r = byKeyR.get(key);
        const lText = l ? text(l) : null;
        const rText = r ? text(r) : null;
        const oneSided = (lText === null) !== (rText === null);
        return { key, l, r, lText, rText, oneSided, differs: !oneSided && lText !== rText };
      })
      // Array.prototype.sort는 안정적이다 (ES2019). 키 순서가 유지된다.
      .sort((x, y) => rank(x) - rank(y))
  );
}
