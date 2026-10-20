/**
 * 성능 차이를 **체감 언어**로 — ADR-0004, 명세 §6.3.
 *
 * 숫자만 주면 3% 차이를 큰 것으로 오해한다. 구간은 ADR-0004의 표 그대로다.
 * 같은 눈금끼리만 부른다 — CPU 렌더와 GPU 렌더는 비교하지 않는다 (ADR-0023).
 */

export interface FeltDifference {
  /** 빠른 쪽이 느린 쪽보다 몇 % 높은가. 반올림한 정수 */
  readonly percent: number;
  readonly label: '체감하기 어려움' | '상황에 따라 느낄 수 있음' | '뚜렷한 차이' | '체급이 다름';
  /** `a`가 빠르면 `a`, `b`가 빠르면 `b`, 같으면 `null` */
  readonly faster: 'a' | 'b' | null;
}

export function feltDifference(a: number, b: number): FeltDifference | null {
  if (!(a > 0) || !(b > 0)) return null;
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  // (hi / lo - 1)은 115/100에서 14.999…가 된다. 차를 먼저 구한다
  const pct = ((hi - lo) / lo) * 100;
  const label =
    pct < 5 ? '체감하기 어려움' : pct < 15 ? '상황에 따라 느낄 수 있음' : pct < 30 ? '뚜렷한 차이' : '체급이 다름';
  return { percent: Math.round(pct), label, faster: a === b ? null : a > b ? 'a' : 'b' };
}

/** 측정 축의 사람 이름 */
export function axisLabel(axis: string): string {
  return axis === 'render.blender' ? '3D 렌더링' : axis;
}

/** 연산 방식 표기 */
export function backendLabel(backend: string): string {
  return (
    { OPTIX: 'OptiX', CUDA: 'CUDA', HIP: 'HIP', ONEAPI: 'oneAPI', METAL: 'Metal', CPU: 'CPU' } as Record<string, string>
  )[backend] ?? backend;
}
