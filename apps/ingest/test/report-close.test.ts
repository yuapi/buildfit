/**
 * 신고를 닫는 두 길 — T-18. 값을 저장하면 resolved, 거절하면 rejected + 「검증 중」 내림.
 */
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';
import { createDb } from '@buildfit/db';
import { createSpecReport, rejectSpecReport } from '@buildfit/db/part';
import { saveSpec } from '@buildfit/db/queries';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createScratchDb, type Scratch } from './helpers/scratch-db';
import { ingest } from '../src/index';

const describeIfDb = process.env['DATABASE_URL'] ? describe : describe.skip;
const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url));

describeIfDb('신고 닫기 (T-18)', () => {
  let scratch: Scratch;
  let sql: postgres.Sql;
  let partId: string;
  const KEY = 'max_gpu_length_mm';

  beforeAll(async () => {
    scratch = await createScratchDb();
    sql = postgres(scratch.url, { max: 1 });
    await ingest({ url: scratch.url, root: FIXTURES, quiet: true });
    const [row] = await sql<{ id: string }[]>`select id from parts where opendb_id = 'aaaaaaaa-0000-4000-8000-000000000001'`;
    partId = row!.id;
  }, 120_000);

  afterAll(async () => {
    await sql?.end();
    await scratch?.drop();
  });

  const withDb = async <T>(f: (db: ReturnType<typeof createDb>['db']) => Promise<T>) => {
    const { db, client } = createDb(scratch.url, { max: 1 });
    try { return await f(db); } finally { await client.end(); }
  };
  const status = async () =>
    (await sql<{ status: string }[]>`select status from spec_reports where part_id = ${partId} and spec_key = ${KEY} order by created_at`).map((r) => r.status);
  const disputed = async () =>
    (await sql<{ disputed: boolean }[]>`select disputed from part_specs where part_id = ${partId} and key = ${KEY}`)[0]?.disputed;

  it('값을 저장하면 그 항목의 열린 신고가 resolved 가 된다', async () => {
    await withDb((db) => createSpecReport(db, { partId, specKey: KEY, note: 'a', clientToken: 't1' }));
    expect(await disputed()).toBe(true);
    await withDb((db) => saveSpec(db, { partId, key: KEY, value: 335, unit: 'mm', sourceUrl: 'https://example.com/s' }));
    expect(await status()).toEqual(['resolved']);
    expect(await disputed()).toBe(false);
  }, 60_000);

  it('★ 거절: 다른 열린 신고가 있으면 「검증 중」을 그대로 두고, 마지막 하나를 거절하면 내린다', async () => {
    await withDb((db) => createSpecReport(db, { partId, specKey: KEY, note: 'b', clientToken: 't2' }));
    await withDb((db) => createSpecReport(db, { partId, specKey: KEY, note: 'c', clientToken: 't3' }));
    const ids = (await sql<{ id: string }[]>`select id from spec_reports where status = 'open' and part_id = ${partId} order by created_at`).map((r) => r.id);
    expect(await withDb((db) => rejectSpecReport(db, ids[0]!))).toBe(true);
    expect(await disputed()).toBe(true);
    expect(await withDb((db) => rejectSpecReport(db, ids[1]!))).toBe(true);
    expect(await disputed()).toBe(false);
    expect(await status()).toEqual(['resolved', 'rejected', 'rejected']);
    // 이미 닫힌 신고는 다시 닫지 않는다
    expect(await withDb((db) => rejectSpecReport(db, ids[0]!))).toBe(false);
  }, 60_000);
});
