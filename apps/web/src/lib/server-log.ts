import 'server-only';

/**
 * 서버 쪽 오류를 한 줄로 남긴다 — T-21.
 *
 * 화면과 서버 동작은 DB가 죽어도 던지지 않고 「지금은 불러올 수 없습니다」로 떨어진다 (deployment.md §3).
 * 사용자에게는 맞지만 **운영자는 원인을 알 수 없었다** — 그 `catch`들이 오류를 그대로 삼켰다.
 * 서비스 로그(`journalctl -u buildfit`)에 어디서 무엇이 났는지만 남긴다.
 *
 * - 접속 문자열의 비밀번호는 가린다. 드라이버 오류가 주소를 싣는 경우가 있다
 * - Next의 흐름 제어(404·redirect)는 오류가 아니다 — 남기지 않는다
 */
export function logServerError(where: string, err: unknown): void {
  if (isNextControlFlow(err)) return;
  // drizzle은 드라이버 오류를 「Failed query: …」로 감싸고 원인을 `cause`에 둔다. 원인이 먼저 보이게 한다
  const cause = err instanceof Error && err.cause !== undefined ? err.cause : undefined;
  const root = cause ?? err;
  const message = root instanceof Error ? root.message : String(root);
  const code =
    root && typeof root === 'object' && 'code' in root && typeof root.code === 'string' ? ` [${root.code}]` : '';
  const query = cause && err instanceof Error ? ` (${err.message.split('\n')[0]})` : '';
  console.error(`[buildfit] ${where}:${code} ${redact(message + query).slice(0, 500)}`);
}

/** `postgres://user:password@host` → `postgres://user:***@host` */
export function redact(text: string): string {
  return text.replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]*:)[^\s@/]*@/gi, '$1***@');
}

function isNextControlFlow(err: unknown): boolean {
  const digest = err && typeof err === 'object' && 'digest' in err ? (err as { digest: unknown }).digest : undefined;
  return typeof digest === 'string' && digest.startsWith('NEXT_');
}
