/**
 * 목록에서 방향키가 짚는 자리.
 *
 * 컴포넌트에서 떼어낸 이유는 **되감김과 경계를 테스트로 고정하려는 것**이다.
 * 목록 끝에서 멈추면 아래로만 갈 수 있는 줄 알기 쉽고, 되감기는 규칙은
 * 손으로 눌러보며 확인하기 번거롭다.
 */

/** 짚은 것이 없는 상태 */
export const NO_CURSOR = -1;

export type CursorKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';

/**
 * 다음 자리. 다룰 키가 아니거나 목록이 비면 `null`.
 *
 * `null`은 "이 키는 우리 것이 아니다"라는 뜻이다. 호출부가 그때
 * `preventDefault`를 하지 않아야 브라우저의 기본 동작이 살아 있는다.
 */
export function nextCursor(key: string, cursor: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    // 위아래로 감는다. 아무것도 짚지 않은 상태에서 ↑는 마지막으로 간다.
    case 'ArrowDown':
      return (cursor + 1) % count;
    case 'ArrowUp':
      // 짚은 것이 없을 때는 마지막으로 간다. 나머지 연산에 맡기면 -1이
      // count-2를 가리켜 끝에서 두 번째가 잡힌다.
      return cursor < 0 ? count - 1 : (cursor - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
