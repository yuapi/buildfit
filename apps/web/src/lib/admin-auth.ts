import 'server-only';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { adminGate } from './admin-gate';

/**
 * 어드민 화면·동작의 문지기 — ADR-0020.
 *
 * 미들웨어가 이미 막지만 여기서 한 번 더 본다. **막는 곳이 하나뿐이면 그 하나가
 * 빗나갈 때 부품 스펙이 고쳐진다.** 미들웨어는 경로 규칙으로 걸고 이쪽은
 * 실행되는 코드에서 걸므로, 한쪽을 비껴간 요청이 다른 쪽에 걸린다.
 *
 * 거부는 404로 낸다. 401 도전은 미들웨어가 이미 보냈고, 여기까지 왔다는 것은
 * 정상 경로가 아니라는 뜻이라 무엇이 있는지 알려줄 이유가 없다.
 */
export async function requireAdmin(): Promise<void> {
  const gate = adminGate({
    token: process.env['ADMIN_TOKEN'],
    isProduction: process.env.NODE_ENV === 'production',
    authorization: (await headers()).get('authorization'),
  });
  if (gate === 'ok' || gate === 'open') return;
  notFound();
}
