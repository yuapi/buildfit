/**
 * 적재된 실제 데이터로 규칙 엔진을 돌려본다.
 *
 * 규칙 엔진은 순수 모듈이라 단위 테스트로는 고정 픽스처만 본다. 실제 OpenDB
 * 데이터에서 판정 불가가 얼마나 나오는지는 돌려봐야 안다 — ADR-0009의 전제를
 * 실측으로 확인하는 것이고, 어드민 보강의 효과를 재는 기준선이 된다.
 *
 * 사용: DATABASE_URL=... npm run sample -w @buildfit/ingest
 */

import { evaluate } from '@buildfit/compat';
import { createDb, parts } from '@buildfit/db';
import { loadBuild } from '@buildfit/db/build';
import { and, eq, sql } from 'drizzle-orm';

const SAMPLE_BUILDS = 300;

async function pickRandom(
  db: ReturnType<typeof createDb>['db'],
  category: string,
  n: number,
): Promise<string[]> {
  const rows = await db
    .select({ id: parts.id })
    .from(parts)
    .where(and(eq(parts.category, category), sql`${parts.category} <> 'GPUChip'`))
    .orderBy(sql`random()`)
    .limit(n);
  return rows.map((r) => r.id);
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL이 필요합니다.');
  const { db, client } = createDb(url);

  try {
    // --- 1) 국내 인기 구성 하나를 이름으로 찾아 판정 ---
    const find = async (category: string, like: string): Promise<string | undefined> => {
      const [row] = await db
        .select({ id: parts.id, name: parts.modelName })
        .from(parts)
        .where(and(eq(parts.category, category), sql`${parts.modelName} ilike ${'%' + like + '%'}`))
        .limit(1);
      return row?.id;
    };

    const sel = {
      cpu: await find('CPU', '9800X3D'),
      motherboard: await find('Motherboard', 'B650 TOMAHAWK'),
      ram: [await find('RAM', 'Trident Z5')].filter((v): v is string => !!v),
      gpu: await find('GPU', 'RTX 5080'),
      pcCase: await find('PCCase', 'O11 Dynamic EVO'),
      psu: await find('PSU', 'RM850x'),
    };

    const build = await loadBuild(db, sel);
    console.log('=== 국내 인기 구성 판정 ===');
    for (const [k, v] of Object.entries(build)) {
      const name = Array.isArray(v) ? v.map((x) => x.name).join(', ') : (v?.name ?? '(미선택)');
      console.log(`  ${k.padEnd(12)} ${name}`);
    }
    const verdict = evaluate(build);
    console.log('');
    for (const r of verdict.results) {
      const mark = r.verdict === 'pass' ? '○' : r.verdict === 'fail' ? '✕' : '?';
      console.log(`  ${mark} #${r.ruleId} ${r.message}`);
      if (r.reason) {
        const fields = r.reason.fields.map((x) => `${x.part} / ${x.field}`).join('; ');
        console.log(`      사유(${r.reason.kind}) ${fields}`);
      }
      if (r.skipped) for (const s of r.skipped) console.log(`      건너뜀: ${s}`);
    }
    console.log(
      `\n  통과 ${verdict.counts.pass} · 실패 ${verdict.counts.fail} · 판정 불가 ${verdict.counts.unknown}`,
    );

    // --- 2) 무작위 조합으로 판정 불가 비율 측정 ---
    console.log(`\n=== 무작위 ${SAMPLE_BUILDS}개 조합 ===`);
    const pools = {
      cpu: await pickRandom(db, 'CPU', SAMPLE_BUILDS),
      motherboard: await pickRandom(db, 'Motherboard', SAMPLE_BUILDS),
      ram: await pickRandom(db, 'RAM', SAMPLE_BUILDS),
      gpu: await pickRandom(db, 'GPU', SAMPLE_BUILDS),
      pcCase: await pickRandom(db, 'PCCase', SAMPLE_BUILDS),
      psu: await pickRandom(db, 'PSU', SAMPLE_BUILDS),
    };

    const perRule = new Map<number, { pass: number; fail: number; unknown: number }>();
    const unknownKinds = new Map<string, number>();
    let buildsWithUnknown = 0;

    for (let i = 0; i < SAMPLE_BUILDS; i += 1) {
      const b = await loadBuild(db, {
        cpu: pools.cpu[i],
        motherboard: pools.motherboard[i],
        ram: pools.ram[i] ? [pools.ram[i]!] : [],
        gpu: pools.gpu[i],
        pcCase: pools.pcCase[i],
        psu: pools.psu[i],
      });
      const v = evaluate(b);
      if (v.counts.unknown > 0) buildsWithUnknown += 1;
      for (const r of v.results) {
        const acc = perRule.get(r.ruleId) ?? { pass: 0, fail: 0, unknown: 0 };
        acc[r.verdict] += 1;
        perRule.set(r.ruleId, acc);
        if (r.reason) unknownKinds.set(r.reason.kind, (unknownKinds.get(r.reason.kind) ?? 0) + 1);
      }
    }

    console.log('규칙   통과   실패  판정불가   판정불가율');
    for (const id of [...perRule.keys()].sort((a, b) => a - b)) {
      const a = perRule.get(id)!;
      const total = a.pass + a.fail + a.unknown;
      console.log(
        `  #${id}  ${String(a.pass).padStart(5)} ${String(a.fail).padStart(6)} ${String(a.unknown).padStart(8)}   ${((100 * a.unknown) / total).toFixed(1)}%`,
      );
    }
    console.log(
      `\n  판정 불가가 하나라도 있는 견적: ${buildsWithUnknown}/${SAMPLE_BUILDS} (${((100 * buildsWithUnknown) / SAMPLE_BUILDS).toFixed(1)}%)`,
    );
    console.log('  판정 불가 사유별:', Object.fromEntries(unknownKinds));
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
