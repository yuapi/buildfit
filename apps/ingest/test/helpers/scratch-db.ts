/**
 * 테스트용 격리 DB.
 *
 * 같은 DB에 대고 돌리면 안 된다. 적재의 낡은 스펙 정리가 픽스처 기준으로 돌아
 * 실제 데이터를 지운다. 필터 테스트도 같은 이유로 남의 데이터를 보면 안 된다.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const ADMIN_URL = process.env['DATABASE_URL'];
const MIGRATIONS = fileURLToPath(new URL('../../../../packages/db/drizzle', import.meta.url));

export interface Scratch {
  readonly url: string;
  readonly drop: () => Promise<void>;
}

/**
 * 격리된 DB를 새로 만든다.
 *
 * 같은 DB에 대고 돌리면 안 된다. 적재에는 **낡은 스펙 정리**가 들어 있어서,
 * 픽스처 두 건만 쓴 채로 돌리면 나머지 2만여 건의 스펙을 전부 지운다.
 */
export async function createScratchDb(): Promise<Scratch> {
  const name = `buildfit_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const admin = postgres(ADMIN_URL!, { max: 1 });
  await admin.unsafe(`create database "${name}"`);
  await admin.end();

  const url = new URL(ADMIN_URL!);
  url.pathname = `/${name}`;

  // 마이그레이션 목록을 손으로 적지 않는다. 0003이 생기면 조용히 낡는다.
  const journal = JSON.parse(await readFile(`${MIGRATIONS}/meta/_journal.json`, 'utf8')) as {
    entries: { idx: number; tag: string }[];
  };
  const files = [...journal.entries].sort((a, b) => a.idx - b.idx).map((e) => `${e.tag}.sql`);

  const sql = postgres(url.toString(), { max: 1 });
  for (const file of files) {
    const text = await readFile(`${MIGRATIONS}/${file}`, 'utf8');
    for (const stmt of text.split('--> statement-breakpoint')) {
      if (stmt.trim() !== '') await sql.unsafe(stmt);
    }
  }
  await sql.end();

  return {
    url: url.toString(),
    drop: async () => {
      const a = postgres(ADMIN_URL!, { max: 1 });
      await a.unsafe(`drop database if exists "${name}" with (force)`);
      await a.end();
    },
  };
}

