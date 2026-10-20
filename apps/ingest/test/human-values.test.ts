/**
 * 적재는 사람이 출처와 함께 고친 값을 덮지 않는다.
 *
 * 어드민의 두 흐름이 이것에 기대고 있다. 빈 필드 채우기(§5.3)와 **값이 어긋나는
 * 스펙 고치기**(이슈 #12)다. 뒤쪽은 OpenDB에 이미 값이 있는 필드를 사람이 고치는
 * 일이라, 적재가 그 행을 덮으면 다음 적재에 틀린 값이 조용히 돌아온다.
 *
 * DB가 필요하다. `DATABASE_URL`이 없으면 건너뛴다 — CI에는 항상 있다.
 */

import postgres from 'postgres';
import { fileURLToPath } from 'node:url';
import { createDb } from '@buildfit/db';
import { saveSpec } from '@buildfit/db/queries';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createScratchDb, type Scratch } from './helpers/scratch-db';
import { ingest } from '../src/index';

const ADMIN_URL = process.env['DATABASE_URL'];
if (process.env['CI'] === 'true' && !ADMIN_URL) {
  throw new Error('CI인데 DATABASE_URL이 없다. 사람이 고친 값 보존 검증이 조용히 빠진다.');
}
const describeIfDb = ADMIN_URL ? describe : describe.skip;

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url));
const CASE_OPENDB_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

describeIfDb('적재는 사람이 고친 값을 덮지 않는다', () => {
  let scratch: Scratch;
  let sql: postgres.Sql;

  beforeAll(async () => {
    scratch = await createScratchDb();
    sql = postgres(scratch.url, { max: 1 });
  }, 60_000);

  afterAll(async () => {
    await sql?.end();
    await scratch?.drop();
  });

  it('OpenDB에 값이 있는 필드를 사람이 고치면 다음 적재 뒤에도 사람 값이 남는다', async () => {
    await ingest({ url: scratch.url, root: FIXTURES, quiet: true });
    const [part] = await sql<{ id: string }[]>`select id from parts where opendb_id = ${CASE_OPENDB_ID}`;
    expect(part).toBeDefined();

    const [before] = await sql<{ value: unknown }[]>`
      select value from part_specs where part_id = ${part!.id} and key = 'max_gpu_length_mm'`;
    expect(before?.value).toBe(360);

    // 어드민이 제조사 페이지를 보고 고쳤다
    const { db, client } = createDb(scratch.url, { max: 1 });
    try {
      await saveSpec(db, {
        partId: part!.id,
        key: 'max_gpu_length_mm',
        value: 335,
        unit: 'mm',
        sourceUrl: 'https://example.com/tc-001/spec',
      });
    } finally {
      await client.end();
    }

    await ingest({ url: scratch.url, root: FIXTURES, quiet: true });

    const [after] = await sql<{ value: unknown; source_url: string; verified_at: Date | null }[]>`
      select value, source_url, verified_at from part_specs
      where part_id = ${part!.id} and key = 'max_gpu_length_mm'`;
    expect(after?.value).toBe(335);
    expect(after?.source_url).toBe('https://example.com/tc-001/spec');
    expect(after?.verified_at).not.toBeNull();
  }, 120_000);
});
