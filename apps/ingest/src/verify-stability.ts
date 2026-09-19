/**
 * `parts.id` 안정성 회귀 검증 — ADR-0012.
 *
 * 공유 URL은 부품 UUID를 담는다. 재적재로 id가 바뀌면 **이미 뿌려진 링크가 전부
 * 죽는다.** 우리가 고칠 수 없는 고장이라 자동으로 지킨다.
 *
 * 적재가 `slug`를 충돌 키로 쓰고 있던 적이 있다. 재현해보니 그때도 id가 조용히
 * 바뀌지는 않았다 — `parts_opendb_id_uq` 위반으로 적재가 멈췄다. 그 인덱스가
 * 실제 방어선이다. 이 스크립트는 인덱스까지 함께 사라진 경우를 잡는다.
 *
 * 사용: DATABASE_URL=... OPENDB_PATH=... npm run verify -w @buildfit/ingest
 *
 * DB와 OpenDB clone이 필요해 단위 테스트로는 둘 수 없다. 배포 전 검증
 * (`autonomous-pipeline-plan.md` §9.1의 ephemeral 환경)에서 돌린다.
 */

import { createDb, parts } from '@buildfit/db';
import { isNotNull } from 'drizzle-orm';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

interface Snapshot {
  /** opendb_id → parts.id */
  readonly byOpendbId: Map<string, string>;
  readonly total: number;
}

async function snapshot(db: ReturnType<typeof createDb>['db']): Promise<Snapshot> {
  const rows = await db
    .select({ id: parts.id, opendbId: parts.opendbId })
    .from(parts)
    .where(isNotNull(parts.opendbId));
  const byOpendbId = new Map<string, string>();
  for (const r of rows) if (r.opendbId) byOpendbId.set(r.opendbId, r.id);
  return { byOpendbId, total: rows.length };
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL이 필요합니다.');
  if (!process.env['OPENDB_PATH']) throw new Error('OPENDB_PATH가 필요합니다.');

  const { db, client } = createDb(url);
  try {
    const before = await snapshot(db);
    if (before.total === 0) {
      throw new Error('적재된 부품이 없습니다. 먼저 ingest를 실행하세요.');
    }
    console.log(`재적재 전: ${before.total}건`);

    console.log('재적재 중…');
    await run('npx', ['tsx', 'src/index.ts'], {
      cwd: new URL('..', import.meta.url).pathname,
      env: process.env,
      maxBuffer: 1024 * 1024 * 16,
    });

    const after = await snapshot(db);
    console.log(`재적재 후: ${after.total}건`);

    const changed: string[] = [];
    const lost: string[] = [];
    for (const [opendbId, id] of before.byOpendbId) {
      const now = after.byOpendbId.get(opendbId);
      if (now === undefined) lost.push(opendbId);
      else if (now !== id) changed.push(`${opendbId}: ${id} → ${now}`);
    }

    console.log('');
    if (changed.length === 0 && lost.length === 0) {
      console.log(`✓ parts.id 안정성 유지 — ${before.total}건 전부 동일`);
      console.log(`  (신규 ${after.total - before.total}건)`);
      return;
    }

    console.error('✕ parts.id가 바뀌었습니다. 기존 공유 링크가 죽습니다 (ADR-0012).');
    if (changed.length > 0) {
      console.error(`  id 변경 ${changed.length}건:`);
      for (const line of changed.slice(0, 10)) console.error(`    ${line}`);
      if (changed.length > 10) console.error(`    … 외 ${changed.length - 10}건`);
    }
    if (lost.length > 0) {
      console.error(`  사라진 부품 ${lost.length}건 (§5.6: 부품 행을 지우지 않는다)`);
      for (const id of lost.slice(0, 10)) console.error(`    ${id}`);
    }
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
