/**
 * BuildCores OpenDB → PostgreSQL 적재 (이슈 #3).
 *
 * 사용:
 *   DATABASE_URL=postgres://... OPENDB_PATH=/path/to/buildcores-open-db npm run ingest
 *
 * 멱등하다. `opendb_id`를 키로 upsert하므로 여러 번 돌려도 같은 결과가 된다.
 * OpenDB 갱신은 `git pull` 후 재실행이다 (§5.6 주 1회).
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createDb, partAliases, parts, partSpecs } from '@buildfit/db';
import { sql } from 'drizzle-orm';
import { CATEGORIES } from './mapping';
import { toPartRow, toSlug, type PartRow } from './transform';
import { flagConflictingSpecs, markDuplicates } from './duplicates';
import { flagImplausibleYears, flagInconsistentRam } from './plausibility';

const CHUNK = 500;

function chunked<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type Logger = (...args: unknown[]) => void;

async function readCategory(root: string, category: string, log: Logger): Promise<PartRow[]> {
  const dir = join(root, 'open-db', category);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    log(`  ! ${category}: 디렉터리 없음 — 건너뜀`);
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
  log(`  ${category.padEnd(12)} ${String(rows.length).padStart(6)}건` + (skipped > 0 ? `  (건너뜀 ${skipped})` : ''));
  return rows;
}

export interface IngestOptions {
  readonly url: string;
  /** OpenDB clone 경로. `open-db/<카테고리>/<opendb_id>.json` 구조를 기대한다 */
  readonly root: string;
  /** 진행 로그. 테스트에서는 끈다 */
  readonly quiet?: boolean;
}

/**
 * 적재 본체.
 *
 * `main()`과 분리해 둔 이유는 **재적재 후 `parts.id`가 유지되는지를 테스트에서
 * 검증하기 위해서다** (ADR-0012). 이 보증이 깨지면 이미 뿌려진 공유 링크가
 * 전부 죽는다. 스크립트를 자식 프로세스로 띄워 확인하는 것보다 직접 부르는 쪽이
 * CI에서 안정적이다.
 */
export async function ingest(opts: IngestOptions): Promise<void> {
  const { url, root } = opts;
  const log: Logger = opts.quiet === true ? () => {} : (...args) => console.log(...args);

  const { db, client } = createDb(url);
  const started = Date.now();

  try {
    log('OpenDB 읽는 중...');
    const all: PartRow[] = [];
    for (const category of CATEGORIES) {
      all.push(...(await readCategory(root, category, log)));
    }
    log(`총 ${all.length}건\n`);

    // --- GPU 칩 레코드를 먼저 만든다 -------------------------------------
    // OpenDB는 AIB 단일 계층이고 칩은 chipset 문자열뿐이다. 그룹핑해 유도한다.
    // pc-builder-spec.md §5.8, 조사 §7.3
    const chipsets = [
      ...new Set(all.filter((r) => r.category === 'GPU' && r.chipsetName).map((r) => r.chipsetName!)),
    ].sort();
    log(`GPU 칩 레코드 ${chipsets.length}종 생성...`);

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
        // 칩 레코드는 OpenDB에 원본이 없어 opendb_id가 비어 있다. slug가 식별자다.
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
    log('부품 적재 중...');
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
            manufacturerUrl: r.manufacturerUrl,
            chipId:
              r.category === 'GPU' && r.chipsetName
                ? (chipIdBySlug.get(`chip-${toSlug([r.chipsetName])}`) ?? null)
                : null,
          })),
        )
        // ★ opendb_id 기준으로 올린다. slug가 아니다.
        // slug는 제품명에서 파생되므로 업스트림이 이름을 고치면 바뀐다. slug를
        // 충돌 키로 쓰면 그때 새 행이 생기고 parts.id가 바뀌는데, 기존 공유 링크가
        // 전부 죽는다 (ADR-0012). opendb_id가 이 데이터의 진짜 식별자다.
        .onConflictDoUpdate({
          target: parts.opendbId,
          set: {
            slug: sql`excluded.slug`,
            category: sql`excluded.category`,
            brand: sql`excluded.brand`,
            modelName: sql`excluded.model_name`,
            // ★ 원본이 연도를 모른다고 기존 값을 지우지 않는다 (이슈 #15).
            // 어드민이 채운 연도가 다음 적재에 사라지면 가장 비싼 데이터를 잃는다.
            // 원본에 값이 있으면 그것이 이긴다 — 아래 「사람이 넣은 값 다시 얹기」가
            // 사람 값을 되돌린다.
            releaseYear: sql`coalesce(excluded.release_year, ${parts.releaseYear})`,
            mpn: sql`excluded.mpn`,
            manufacturerUrl: sql`excluded.manufacturer_url`,
            chipId: sql`excluded.chip_id`,
            updatedAt: sql`now()`,
          },
        });
      done += batch.length;
      if (done % 5000 === 0) log(`  ${done} / ${all.length}`);
    }

    // slug → id
    const idBySlug = new Map<string, string>();
    for (const row of await db.select({ id: parts.id, slug: parts.slug }).from(parts)) {
      idBySlug.set(row.slug, row.id);
    }

    // --- 스펙 적재 --------------------------------------------------------
    log('스펙 적재 중...');
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
          // ★ 사람이 출처와 함께 고친 행은 덮지 않는다 (이슈 #19). 어긋난 값 고치기
          // (이슈 #12)는 전부 OpenDB에 값이 있는 필드라, 덮으면 다음 적재에 틀린 값이
          // 조용히 돌아온다. 출처 없는 행은 사람 것일 수 없다 — saveSpec이 출처를 요구한다
          setWhere: sql`${partSpecs.sourceUrl} is null or ${partSpecs.sourceUrl} like 'https://github.com/buildcores/%'`,
        });
    }

    // --- 낡은 스펙 정리 ----------------------------------------------------
    // upsert만 하면 업스트림에서 사라진 필드나 매핑에서 빠진 키가 영원히 남는다.
    // 예: 0으로 채워져 있던 슬롯 폭을 결측으로 처리하기로 바꿔도 옛 행이 남아
    // 화면에 "0슬롯"으로 나간다.
    //
    // **사람이 넣은 값은 건드리지 않는다.** 어드민 보강(§5.3)으로 채운 값은
    // source_url이 OpenDB가 아니다. 그것까지 지우면 가장 비싼 데이터를 잃는다.
    log('낡은 스펙 정리 중...');
    // 임시 테이블은 세션에 묶인다. 커넥션 풀에서는 트랜잭션 하나로 감싸야
    // 같은 세션에서 만들고 쓰고 지운다.
    let removed = 0;
    await db.transaction(async (tx) => {
      await tx.execute(sql`create temporary table written_specs (part_id uuid, key text)`);
      for (const batch of chunked(specValues, CHUNK)) {
        const rows = sql.join(
          batch.map((v) => sql`(${v.partId}::uuid, ${v.key})`),
          sql`, `,
        );
        await tx.execute(sql`insert into written_specs (part_id, key) values ${rows}`);
      }
      await tx.execute(sql`create index on written_specs (part_id, key)`);
      const result = await tx.execute(sql`
        delete from ${partSpecs} s
        where s.source_url like 'https://github.com/buildcores/%'
          and not exists (
            select 1 from written_specs w where w.part_id = s.part_id and w.key = s.key
          )
      `);
      removed = Number(result.count ?? 0);
      await tx.execute(sql`drop table written_specs`);
    });
    log(`  ${removed}건 제거`);

    // --- 표기 변형 --------------------------------------------------------
    log('표기 변형 적재 중...');
    const aliasValues = all.flatMap((r) => {
      const partId = idBySlug.get(r.slug);
      if (!partId) return [];
      return r.aliases.map((rawName) => ({ partId, rawName, source: 'opendb' }));
    });
    for (const batch of chunked(aliasValues, CHUNK)) {
      await db.insert(partAliases).values(batch).onConflictDoNothing();
    }

    // --- 사람이 넣은 값 다시 얹기 ------------------------------------------
    // `parts` 컬럼에 있는 입력은 컬럼별 출처를 담을 자리가 없어서, 어드민이
    // 채울 때 `part_specs`에도 같은 키로 흔적을 남긴다 (출처·확인 시각).
    // 그 행이 사람이 넣었다는 증거이므로, 적재가 컬럼을 덮어썼다면 되돌린다.
    //
    // 스펙 쪽의 「사람이 넣은 값은 건드리지 않는다」와 같은 원칙이다.
    log('사람이 넣은 컬럼 값 다시 얹는 중...');
    const restored = await db.execute(sql`
      update ${parts} p
      set release_year = (s.value #>> '{}')::int, updated_at = now()
      from ${partSpecs} s
      where s.part_id = p.id
        and s.key = 'release_year'
        and s.source_url not like 'https://github.com/buildcores/%'
        and jsonb_typeof(s.value) = 'number'
        and p.release_year is distinct from (s.value #>> '{}')::int
    `);
    log(`  ${Number(restored.count ?? 0)}건`);

    // --- 중복 묶기 --------------------------------------------------------
    // 같은 제품이 여러 레코드로 들어 있다. 합치지 않고 대표를 가리킨다 —
    // parts.id는 공유 URL이 담으므로 없애면 링크가 깨진다 (ADR-0012).
    log('중복 레코드 묶는 중...');
    const dup = await markDuplicates(db);
    log(`  ${dup.groups}그룹 · ${dup.marked}건을 대표 아님으로 표시`);
    // 같은 제품인데 스펙이 어긋나면 하나는 틀린 값이다. 어드민이 볼 목록이 된다
    const conflicts = await flagConflictingSpecs(db);
    log(
      `  값이 어긋나는 스펙 ${conflicts.standing}건에 검증 표시` +
        (conflicts.marked > 0 ? ` (새로 ${conflicts.marked}건)` : '') +
        (conflicts.retracted > 0 ? ` (더는 어긋나지 않아 거둠 ${conflicts.retracted}건)` : ''),
    );
    // 소켓이 나오기 전 연도를 단 레코드. 규칙 12가 그 값으로 판정한다 (이슈 #18)
    const years = await flagImplausibleYears(db);
    log(`  소켓보다 앞선 출시 연도 ${years.flagged}건에 검증 표시`);
    // 모듈 수 × 모듈 용량 ≠ 총 용량인 메모리. 규칙 3·16이 그 값을 읽는다 (이슈 #20)
    const ram = await flagInconsistentRam(db);
    log(`  스스로 모순인 메모리 값 ${ram.flagged}건에 검증 표시`);

    // --- 요약 -------------------------------------------------------------
    const [counts] = await db
      .select({
        parts: sql<number>`(select count(*)::int from ${parts})`,
        specs: sql<number>`(select count(*)::int from ${partSpecs})`,
        aliases: sql<number>`(select count(*)::int from ${partAliases})`,
      })
      .from(sql`(select 1) as _`);

    const secs = ((Date.now() - started) / 1000).toFixed(1);
    log(`\n완료 (${secs}s)`);
    log(`  parts        ${counts?.parts ?? 0}`);
    log(`  part_specs   ${counts?.specs ?? 0}`);
    log(`  part_aliases ${counts?.aliases ?? 0}`);
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  const root = process.env['OPENDB_PATH'];
  if (!url) throw new Error('DATABASE_URL이 필요합니다.');
  if (!root) throw new Error('OPENDB_PATH가 필요합니다 (OpenDB clone 경로).');
  await ingest({ url, root });
}

// 테스트가 이 모듈을 import할 때 적재가 돌면 안 된다.
if (process.argv[1]?.endsWith('index.ts') === true) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
