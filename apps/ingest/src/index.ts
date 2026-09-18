/**
 * BuildCores OpenDB → PostgreSQL 적재 (이슈 #3).
 *
 * 사용:
 *   DATABASE_URL=postgres://... OPENDB_PATH=/path/to/buildcores-open-db npm run ingest
 *
 * 멱등하다. `opendb_id`를 키로 upsert하므로 여러 번 돌려도 같은 결과가 된다.
 * OpenDB 갱신은 `git pull` 후 재실행이다 (§5.7.1 주 1회).
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createDb, importers, partAliases, parts, partSpecs } from '@buildfit/db';
import { sql } from 'drizzle-orm';
import { CATEGORIES } from './mapping';
import { toPartRow, toSlug, type PartRow } from './transform';

const CHUNK = 500;

function chunked<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function readCategory(root: string, category: string): Promise<PartRow[]> {
  const dir = join(root, 'open-db', category);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    console.warn(`  ! ${category}: 디렉터리 없음 — 건너뜀`);
    return [];
  }
  const rows: PartRow[] = [];
  let skipped = 0;
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const opendbId = file.slice(0, -5);
    try {
      const raw = await readFile(join(dir, file), 'utf8');
      const record = JSON.parse(raw) as Record<string, unknown>;
      const row = toPartRow(category, opendbId, record);
      if (row) rows.push(row);
      else skipped += 1;
    } catch {
      skipped += 1;
    }
  }
  console.log(`  ${category.padEnd(12)} ${String(rows.length).padStart(6)}건` + (skipped > 0 ? `  (건너뜀 ${skipped})` : ''));
  return rows;
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  const root = process.env['OPENDB_PATH'];
  if (!url) throw new Error('DATABASE_URL이 필요합니다.');
  if (!root) throw new Error('OPENDB_PATH가 필요합니다 (OpenDB clone 경로).');

  const { db, client } = createDb(url);
  const started = Date.now();

  try {
    console.log('OpenDB 읽는 중...');
    const all: PartRow[] = [];
    for (const category of CATEGORIES) {
      all.push(...(await readCategory(root, category)));
    }
    console.log(`총 ${all.length}건\n`);

    // --- GPU 칩 레코드를 먼저 만든다 -------------------------------------
    // OpenDB는 AIB 단일 계층이고 칩은 chipset 문자열뿐이다. 그룹핑해 유도한다.
    // pc-builder-spec.md §5.8, 조사 §7.3
    const chipsets = [
      ...new Set(all.filter((r) => r.category === 'GPU' && r.chipsetName).map((r) => r.chipsetName!)),
    ].sort();
    console.log(`GPU 칩 레코드 ${chipsets.length}종 생성...`);

    const chipRows = chipsets.map((name) => ({
      slug: `chip-${toSlug([name])}`,
      category: 'GPUChip',
      brand: null,
      modelName: name,
    }));
    for (const part of chunked(chipRows, CHUNK)) {
      await db
        .insert(parts)
        .values(part)
        .onConflictDoUpdate({
          target: parts.slug,
          set: { modelName: sql`excluded.model_name`, updatedAt: sql`now()` },
        });
    }
    const chipIdBySlug = new Map<string, string>();
    for (const row of await db
      .select({ id: parts.id, slug: parts.slug })
      .from(parts)
      .where(sql`${parts.category} = 'GPUChip'`)) {
      chipIdBySlug.set(row.slug, row.id);
    }

    // --- 부품 적재 --------------------------------------------------------
    console.log('부품 적재 중...');
    let done = 0;
    for (const batch of chunked(all, CHUNK)) {
      await db
        .insert(parts)
        .values(
          batch.map((r) => ({
            slug: r.slug,
            category: r.category,
            brand: r.brand,
            modelName: r.modelName,
            releaseYear: r.releaseYear,
            opendbId: r.opendbId,
            mpn: r.mpn,
            chipId:
              r.category === 'GPU' && r.chipsetName
                ? (chipIdBySlug.get(`chip-${toSlug([r.chipsetName])}`) ?? null)
                : null,
          })),
        )
        .onConflictDoUpdate({
          target: parts.slug,
          set: {
            category: sql`excluded.category`,
            brand: sql`excluded.brand`,
            modelName: sql`excluded.model_name`,
            releaseYear: sql`excluded.release_year`,
            opendbId: sql`excluded.opendb_id`,
            mpn: sql`excluded.mpn`,
            chipId: sql`excluded.chip_id`,
            updatedAt: sql`now()`,
          },
        });
      done += batch.length;
      if (done % 5000 === 0) console.log(`  ${done} / ${all.length}`);
    }

    // slug → id
    const idBySlug = new Map<string, string>();
    for (const row of await db.select({ id: parts.id, slug: parts.slug }).from(parts)) {
      idBySlug.set(row.slug, row.id);
    }

    // --- 스펙 적재 --------------------------------------------------------
    console.log('스펙 적재 중...');
    const specValues = all.flatMap((r) => {
      const partId = idBySlug.get(r.slug);
      if (!partId) return [];
      return r.specs.map((s) => ({
        partId,
        key: s.key,
        value: s.value as never,
        unit: s.unit,
        // 1차 소스 표기. §5.5의 source_url 원칙.
        sourceUrl: `https://github.com/buildcores/buildcores-open-db/blob/main/open-db/${r.category}/${r.opendbId}.json`,
      }));
    });
    for (const batch of chunked(specValues, CHUNK)) {
      await db
        .insert(partSpecs)
        .values(batch)
        .onConflictDoUpdate({
          target: [partSpecs.partId, partSpecs.key],
          set: {
            value: sql`excluded.value`,
            unit: sql`excluded.unit`,
            sourceUrl: sql`excluded.source_url`,
            updatedAt: sql`now()`,
          },
        });
    }

    // --- 표기 변형 --------------------------------------------------------
    console.log('표기 변형 적재 중...');
    const aliasValues = all.flatMap((r) => {
      const partId = idBySlug.get(r.slug);
      if (!partId) return [];
      return r.aliases.map((rawName) => ({ partId, rawName, source: 'opendb' }));
    });
    for (const batch of chunked(aliasValues, CHUNK)) {
      await db.insert(partAliases).values(batch).onConflictDoNothing();
    }

    // --- 요약 -------------------------------------------------------------
    const [counts] = await db
      .select({
        parts: sql<number>`(select count(*)::int from ${parts})`,
        specs: sql<number>`(select count(*)::int from ${partSpecs})`,
        aliases: sql<number>`(select count(*)::int from ${partAliases})`,
        importers: sql<number>`(select count(*)::int from ${importers})`,
      })
      .from(sql`(select 1) as _`);

    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`\n완료 (${secs}s)`);
    console.log(`  parts        ${counts?.parts ?? 0}`);
    console.log(`  part_specs   ${counts?.specs ?? 0}`);
    console.log(`  part_aliases ${counts?.aliases ?? 0}`);
    console.log(`  importers    ${counts?.importers ?? 0}`);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
