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
  readonly differs: boolean;
}

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
        // 한쪽에만 있는 것도 "다름"이다. null과 값은 같지 않다.
        return { key, l, r, lText, rText, differs: lText !== rText };
      })
      // Array.prototype.sort는 안정적이다 (ES2019). 키 순서가 유지된다.
      .sort((x, y) => Number(y.differs) - Number(x.differs))
  );
}
