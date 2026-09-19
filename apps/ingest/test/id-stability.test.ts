/**
 * `parts.id` 안정성 회귀 테스트 — ADR-0012.
 *
 * 공유 URL은 부품 UUID를 담는다. **재적재로 id가 바뀌면 이미 뿌려진 링크가
 * 전부 죽는다.** 우리가 고칠 수 없는 고장이므로 손 대조가 아니라 테스트로 지킨다.
 *
 * 적재가 `slug`를 충돌 키로 쓰던 시절이 있었다. slug는 제품명에서 파생되므로
 * 업스트림이 이름을 고치면 바뀐다. 그래서 **제품명이 바뀌는 상황**을 재현한다.
 *
 * DB가 필요하다. `DATABASE_URL`이 없으면 건너뛴다 — CI에는 항상 있다
 * (`.github/workflows/ci.yml`).
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ingest } from '../src/index';

const ADMIN_URL = process.env['DATABASE_URL'];
const describeIfDb = ADMIN_URL ? describe : describe.skip;

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url));
const CASE_FILE = `${FIXTURES}/open-db/PCCase/aaaaaaaa-0000-4000-8000-000000000001.json`;
const MIGRATIONS = fileURLToPath(new URL('../../../packages/db/drizzle', import.meta.url));

/**
 * 격리된 DB를 새로 만든다.
 *
 * 같은 DB에 대고 돌리면 안 된다. 적재에는 **낡은 스펙 정리**가 들어 있어서,
 * 픽스처 두 건만 쓴 채로 돌리면 나머지 2만여 건의 스펙을 전부 지운다.
 */
async function createScratchDb(): Promise<{ url: string; drop: () => Promise<void> }> {
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

describeIfDb('재적재해도 parts.id는 바뀌지 않는다 (ADR-0012)', () => {
  let scratch: { url: string; drop: () => Promise<void> };
  let original: string;

  beforeAll(async () => {
    original = await readFile(CASE_FILE, 'utf8');
    scratch = await createScratchDb();
  }, 60_000);

  afterAll(async () => {
    await writeFile(CASE_FILE, original);
    await scratch?.drop();
  });

  it('제품명이 바뀌어도 id가 유지되고 slug만 갱신된다', async () => {
    await ingest({ url: scratch.url, root: FIXTURES, quiet: true });

    const sql = postgres(scratch.url, { max: 1 });
    try {
      const before = await sql<{ id: string; slug: string; opendb_id: string }[]>`
        select id, slug, opendb_id from parts where opendb_id is not null order by opendb_id
      `;
      expect(before.length).toBeGreaterThanOrEqual(2);
      const caseRow = before.find((r) => r.opendb_id.endsWith('0001'));
      expect(caseRow?.slug).toContain('alpha');

      // 업스트림이 제품명을 고친 상황. slug가 파생되므로 함께 바뀐다.
      const record = JSON.parse(original) as { metadata: { name: string } };
      record.metadata.name = 'Testco Beta Case';
      await writeFile(CASE_FILE, JSON.stringify(record, null, 2));

      await ingest({ url: scratch.url, root: FIXTURES, quiet: true });

      const after = await sql<{ id: string; slug: string; opendb_id: string }[]>`
        select id, slug, opendb_id from parts where opendb_id is not null order by opendb_id
      `;

      // 1) id가 하나도 바뀌지 않는다 — 이것이 공유 링크의 생명줄이다
      const idBefore = new Map(before.map((r) => [r.opendb_id, r.id]));
      for (const row of after) {
        expect(idBefore.get(row.opendb_id), `${row.opendb_id}의 id가 바뀌었다`).toBe(row.id);
      }
      // 2) 행이 새로 생기지도 않는다
      expect(after.length).toBe(before.length);
      // 3) 그런데 slug는 갱신된다. 데이터가 낡은 채로 남으면 안 된다
      expect(after.find((r) => r.opendb_id.endsWith('0001'))?.slug).toContain('beta');
    } finally {
      await sql.end();
    }
  }, 120_000);

  it('opendb_id 유니크 인덱스가 실제 방어선이다', async () => {
    const sql = postgres(scratch.url, { max: 1 });
    try {
      // 이 인덱스가 사라지면 충돌 키를 잘못 잡아도 적재가 조용히 통과한다.
      // 그때부터 id가 바뀌기 시작한다. 인덱스 자체를 테스트로 고정한다.
      const [row] = await sql<{ indexdef: string }[]>`
        select indexdef from pg_indexes
        where tablename = 'parts' and indexname = 'parts_opendb_id_uq'
      `;
      expect(row?.indexdef, 'parts_opendb_id_uq가 없다').toBeDefined();
      expect(row!.indexdef).toContain('UNIQUE');
      expect(row!.indexdef).toContain('opendb_id');
    } finally {
      await sql.end();
    }
  }, 30_000);
});
