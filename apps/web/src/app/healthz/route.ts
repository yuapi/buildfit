import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';

/**
 * 배포 플랫폼이 부를 준비 상태 점검 — `docs/deployment.md`.
 *
 * **공개 화면은 DB가 없어도 200을 낸다** (각 화면이 "지금은 불러올 수 없습니다"로
 * 떨어진다). 그건 사용자에게는 맞는 동작이지만, 그래서 **배포 플랫폼은 DB가
 * 끊긴 것을 알 수 없다.** 이 주소가 그 구분을 맡는다.
 *
 * 몸통은 최소로 둔다. 인증 없이 열려 있으므로 오류 내용이나 접속 문자열의
 * 어떤 조각도 내보내지 않는다 — 200이냐 503이냐만 말한다.
 */
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const headers = { 'cache-control': 'no-store', 'content-type': 'application/json' };
  try {
    await getDb().execute(sql`select 1`);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch {
    return new Response(JSON.stringify({ ok: false }), { status: 503, headers });
  }
}
