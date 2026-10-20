/**
 * 어드민 접근 판정 — ADR-0020.
 *
 * 계정을 만들지 않는다 (ADR-0001). 공유 비밀 **하나**를 HTTP Basic으로 받고,
 * 사용자 이름은 보지 않는다. 계정이 아니라 비밀이기 때문이다.
 *
 * 프레임워크에 기대지 않는 순수 함수로 둔다. 미들웨어(Edge)와 서버 컴포넌트가
 * 같은 판정을 써야 한다 — 막는 곳마다 규칙이 다르면 한쪽이 빗나간다.
 */

/**
 * 비밀이 이보다 짧으면 비밀로 치지 않는다. 짧은 비밀은 없는 것과 같은데,
 * 있다고 착각하면 더 나쁘다.
 */
export const MIN_ADMIN_TOKEN = 16;

export type AdminGate =
  /** 비밀이 없는 개발 환경. 지금까지처럼 그냥 열린다 */
  | 'open'
  /** 비밀이 맞다 */
  | 'ok'
  /** 비밀이 필요한데 없거나 틀리다 → 401 */
  | 'unauthorized'
  /** 배포본에 비밀이 없다 → 어드민이 아예 없는 것으로 둔다 */
  | 'disabled';

export interface AdminGateInput {
  /** `ADMIN_TOKEN` 환경변수 */
  readonly token: string | undefined;
  readonly isProduction: boolean;
  readonly authorization: string | null | undefined;
}

export function adminGate(input: AdminGateInput): AdminGate {
  const token = (input.token ?? '').trim();
  if (token.length < MIN_ADMIN_TOKEN) {
    // 배포본에서는 비밀이 없으면 어드민이 없다. 켜는 쪽이 명시적이어야 한다 —
    // 반대로 두면 환경변수 한 줄을 빠뜨린 배포가 스펙 편집기를 공개한다.
    return input.isProduction ? 'disabled' : 'open';
  }
  const given = basicSecret(input.authorization);
  if (given === null) return 'unauthorized';
  return safeEqual(given, token) ? 'ok' : 'unauthorized';
}

/**
 * `Basic dXNlcjpzZWNyZXQ=` 에서 비밀만 꺼낸다.
 * 콜론이 없으면 전체를 비밀로 본다 — `curl -u :비밀`도 아이디 없는 입력도 통한다.
 */
function basicSecret(header: string | null | undefined): string | null {
  if (typeof header !== 'string') return null;
  const m = /^\s*Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(header);
  if (!m) return null;
  let decoded: string;
  try {
    // atob은 바이트를 주지 이미 UTF-8을 풀어 주지 않는다. 한글 비밀도 통하게 한다.
    const bytes = Uint8Array.from(atob(m[1]!), (c) => c.charCodeAt(0));
    decoded = new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
  const colon = decoded.indexOf(':');
  return colon === -1 ? decoded : decoded.slice(colon + 1);
}

/**
 * 길이가 달라도 끝까지 돈다. 앞자리부터 맞춰 가며 응답 시간을 재는 공격을 막는다.
 * 길이 자체는 새지만, 그것만으로는 비밀을 못 맞힌다.
 */
function safeEqual(a: string, b: string): boolean {
  const n = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < n; i += 1) {
    diff |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
  }
  return diff === 0;
}
