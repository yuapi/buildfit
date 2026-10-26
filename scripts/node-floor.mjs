#!/usr/bin/env node
// 실행 중인 Node가 package.json `engines.node`의 하한(>=X.Y.Z)을 넘는가 — ADR-0030.
//
//   node scripts/node-floor.mjs      넘으면 0, 아니면 1과 함께 한 줄을 stderr에
//
// 하한은 package.json 한 곳에만 적는다. 배포(deploy.sh)는 경고만, 첫 설치(setup-server.sh)는 멈춘다.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** `>=22.23.4` 모양만 받는다. 다른 모양이면 이 스크립트를 고친다 — 조용히 통과시키지 않는다 */
export function parseFloor(range) {
  const m = /^>=\s*(\d+)\.(\d+)\.(\d+)$/.exec(String(range ?? '').trim());
  if (!m) throw new Error(`engines.node는 ">=X.Y.Z" 모양이어야 한다: ${range}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function meetsFloor(version, floor) {
  const have = String(version).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((have[i] ?? 0) !== floor[i]) return (have[i] ?? 0) > floor[i];
  }
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const floor = parseFloor(pkg.engines?.node);
  if (!meetsFloor(process.versions.node, floor)) {
    console.error(`Node ${process.versions.node}는 하한 ${floor.join('.')}보다 낮다 (package.json engines.node)`);
    process.exit(1);
  }
}
