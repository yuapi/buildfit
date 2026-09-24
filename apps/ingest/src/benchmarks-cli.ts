/**
 * Blender Open Data 스냅숏을 적재한다 — ADR-0023.
 *
 *   curl -O https://opendata.blender.org/snapshots/opendata-latest.zip
 *   DATABASE_URL=… npm run ingest:benchmarks -- opendata-latest.zip
 *
 * 압축을 풀지 않고 `unzip -p`로 흘려 읽는다 — 풀면 1.9GB다.
 */

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createDb } from '@buildfit/db';
import { aggregateBlender, loadBlenderBenchmarks } from './benchmarks';

async function main(): Promise<void> {
  const zip = process.argv[2];
  const url = process.env['DATABASE_URL'];
  if (!zip || !url) {
    console.error('사용: DATABASE_URL=… npm run ingest:benchmarks -- <opendata-latest.zip>');
    process.exit(2);
  }

  const child = spawn('unzip', ['-p', zip, 'opendata-*.jsonl'], { stdio: ['ignore', 'pipe', 'inherit'] });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const scores = await aggregateBlender(lines);
  const code = await new Promise<number | null>((resolve) => child.on('close', resolve));
  if (code !== 0) throw new Error(`unzip이 ${code}로 끝났다`);

  // 파일 이름에 스냅숏 날짜가 들어 있다 (opendata-2026-09-24-000000+0000.jsonl)
  const listing = await new Promise<string>((resolve, reject) => {
    const l = spawn('unzip', ['-Z1', zip]);
    let out = '';
    l.stdout.on('data', (d) => (out += d));
    l.on('close', (c) => (c === 0 ? resolve(out) : reject(new Error('unzip -Z1 실패'))));
  });
  const snapshotDate = /opendata-(\d{4}-\d{2}-\d{2})/.exec(listing)?.[1];
  if (!snapshotDate) throw new Error('스냅숏 날짜를 찾지 못했다');

  const { db, client } = createDb(url, { max: 2 });
  try {
    const r = await loadBlenderBenchmarks(db, scores, snapshotDate);
    console.log(`장치 ${scores.length}개 중 ${r.devices}개가 카탈로그와 맞아 부품 ${r.parts}개에 실었다 (스냅숏 ${snapshotDate})`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
