/**
 * Blender Open Data → `part_benchmarks` — ADR-0023, 명세 §6.9.
 *
 * 사용:
 *   curl -O https://opendata.blender.org/snapshots/opendata-latest.zip
 *   DATABASE_URL=… npm run ingest:benchmarks -- opendata-latest.zip
 *
 * **선택 단계다.** 스냅숏(압축 101MB)은 레포에 넣지 않는다. 없으면 부품 페이지가
 * 「측정값 없음」이라고 적을 뿐 다른 것은 그대로다.
 *
 * 근거와 방법: `docs/research/blender-open-data.md`
 */

import { sql } from 'drizzle-orm';
import type { Database } from '@buildfit/db';

export const BLENDER_AXIS = 'render.blender';
export const BLENDER_VERSION = '4.5';
/** 세 장면 합의 단위. Blender Open Data 사이트의 점수 정의와 같다 */
export const BLENDER_UNIT = '샘플/분';
export const BLENDER_SOURCE_URL = 'https://opendata.blender.org/';
/** 이보다 실행이 적으면 싣지 않는다 */
export const MIN_RUNS = 5;

const SCENES = ['monster', 'junkshop', 'classroom'] as const;

/**
 * 장치 이름을 맞대기 위한 모양으로 — **정확히 같은 것만 잇는다.**
 *
 * 상표(®·™), `N-Core Processor`, `CPU @ 2.80GHz`, `with Radeon Graphics`,
 * 제조사·브랜드 낱말, 포장 표기(`OEM/Tray`·`Box`)를 걷어낸다. 걷어낸 뒤 비면 `null`이다 — 「AMD Radeon(TM) Graphics」
 * 같은 내장 그래픽은 무엇인지 모른다.
 *
 * ★ **노트북용은 `null`이다.** `RTX 4070 Laptop GPU`에서 「Laptop GPU」를 걷어내면 데스크톱
 * RTX 4070에 붙는다 — 전력 한계가 달라 점수가 크게 다르다. 틀린 점수가 붙는 것이
 * 없는 것보다 나쁘다.
 */
export function normalizeDeviceName(raw: string): string | null {
  const lower = raw.toLowerCase();
  if (/\b(laptop|mobile|max-q|notebook)\b/.test(lower)) return null;
  const s = lower
    .replace(/\(r\)|\(tm\)|®|™/g, ' ')
    .replace(/@.*$/, ' ')
    .replace(/\bwith radeon (vega )?graphics\b/g, ' ')
    .replace(/\b\d+-core processor\b/g, ' ')
    .replace(/\b(processor|cpu)\b/g, ' ')
    .replace(/\b(nvidia|amd|intel|geforce|radeon|corporation|graphics)\b/g, ' ')
    // 포장 표기는 칩이 아니다. 카탈로그 이름에만 붙어 포장 표기 CPU 200개가 하나도 안 맞았다 (이슈 #52)
    .replace(/\b(oem|tray|boxed|box|wof|mpk)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return s === '' ? null : s;
}

export interface DeviceScore {
  /** `cpu` 또는 `gpu` — 같은 종류끼리만 비교한다 */
  readonly kind: 'cpu' | 'gpu';
  readonly key: string;
  /** 가장 자주 나온 원래 이름. 화면에 그대로 보인다 */
  readonly deviceName: string;
  readonly backend: string;
  readonly median: number;
  readonly runs: number;
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

interface Entry {
  scene?: { label?: string };
  stats?: { samples_per_minute?: number };
  blender_version?: { version?: string };
  device_info?: { device_type?: string; compute_devices?: ({ name?: string } | string)[] };
}

/**
 * 스냅숏 줄들 → 장치별 점수.
 *
 * 한 실행 = 세 장면 분당 샘플 수의 합. 장치가 둘 이상인 실행과 장면이 빠진 실행은 뺀다.
 * **GPU는 실행이 가장 많은 연산 방식**을 쓴다 (NVIDIA OptiX · AMD HIP · Intel oneAPI가 된다).
 * 가장 높은 방식을 고르면 실행이 적은 방식의 이상치가 뽑힌다.
 */
export async function aggregateBlender(
  lines: AsyncIterable<string> | Iterable<string>,
  version = BLENDER_VERSION,
): Promise<DeviceScore[]> {
  // (kind, key, backend) → 점수들, 원래 이름 빈도
  const scores = new Map<string, number[]>();
  const names = new Map<string, Map<string, number>>();

  for await (const line of lines) {
    if (line.trim() === '') continue;
    let doc: { data?: unknown };
    try {
      doc = JSON.parse(line);
    } catch {
      continue;
    }
    if (!Array.isArray(doc.data)) continue;
    const entries = doc.data as Entry[];

    const byScene = new Map<string, number>();
    let device: string | null = null;
    let backend: string | null = null;
    let ok = true;
    for (const e of entries) {
      const v = (e.blender_version?.version ?? '').split(' ')[0] ?? '';
      if (v.split('.').slice(0, 2).join('.') !== version) {
        ok = false;
        break;
      }
      const cds = e.device_info?.compute_devices ?? [];
      if (cds.length !== 1) {
        ok = false;
        break;
      }
      const cd = cds[0]!;
      const name = (typeof cd === 'string' ? cd : (cd.name ?? '')).trim();
      const type = e.device_info?.device_type ?? '';
      if (device === null) [device, backend] = [name, type];
      else if (device !== name || backend !== type) {
        ok = false;
        break;
      }
      const scene = e.scene?.label ?? '';
      const spm = e.stats?.samples_per_minute;
      if (typeof spm === 'number' && Number.isFinite(spm)) byScene.set(scene, spm);
    }
    if (!ok || device === null || backend === null) continue;
    if (!SCENES.every((s) => byScene.has(s))) continue;

    const key = normalizeDeviceName(device);
    if (key === null) continue;
    const kind = backend === 'CPU' ? 'cpu' : 'gpu';
    const id = `${kind}|${key}|${backend}`;
    const total = SCENES.reduce((n, s) => n + byScene.get(s)!, 0);
    const list = scores.get(id) ?? [];
    list.push(total);
    scores.set(id, list);
    const nm = names.get(id) ?? new Map<string, number>();
    nm.set(device, (nm.get(device) ?? 0) + 1);
    names.set(id, nm);
  }

  // 장치마다 실행이 가장 많은 방식 하나
  const best = new Map<string, { id: string; runs: number }>();
  for (const [id, xs] of scores) {
    const [kind, key] = id.split('|');
    const dev = `${kind}|${key}`;
    const cur = best.get(dev);
    if (!cur || xs.length > cur.runs) best.set(dev, { id, runs: xs.length });
  }

  const out: DeviceScore[] = [];
  for (const { id, runs } of best.values()) {
    if (runs < MIN_RUNS) continue;
    const [kind, key, backend] = id.split('|') as ['cpu' | 'gpu', string, string];
    const nm = [...names.get(id)!.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    out.push({ kind, key, deviceName: nm, backend, median: median(scores.get(id)!), runs });
  }
  return out;
}

export interface BenchmarkLoadResult {
  /** 값을 받은 부품 수 */
  readonly parts: number;
  /** 카탈로그와 맞은 장치 수 */
  readonly devices: number;
}

/**
 * 점수를 부품에 붙인다. CPU는 모델 이름, GPU는 칩(`chipset`)으로 맞춘다.
 *
 * **이 축의 행을 전부 지우고 다시 쓴다.** 스냅숏이 바뀌면 사라진 장치의 옛 값이 남으면 안 된다.
 */
export async function loadBlenderBenchmarks(
  db: Database,
  scores: readonly DeviceScore[],
  snapshotDate: string,
): Promise<BenchmarkLoadResult> {
  const byKey = new Map(scores.map((s) => [`${s.kind}|${s.key}`, s]));

  const candidates = await db.execute<{ id: string; category: string; name: string }>(sql`
    select p.id, p.category, p.model_name as name from parts p where p.category = 'CPU'
    union all
    select p.id, p.category, s.value #>> '{}' as name
    from parts p join part_specs s on s.part_id = p.id and s.key = 'chipset'
    where p.category = 'GPU'
  `);

  const rows: {
    partId: string;
    score: DeviceScore;
  }[] = [];
  const matched = new Set<string>();
  for (const c of candidates) {
    const key = normalizeDeviceName(c.name);
    if (key === null) continue;
    const kind = c.category === 'CPU' ? 'cpu' : 'gpu';
    const score = byKey.get(`${kind}|${key}`);
    if (!score) continue;
    rows.push({ partId: c.id, score });
    matched.add(`${kind}|${key}`);
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`delete from part_benchmarks where axis = ${BLENDER_AXIS}`);
    for (let i = 0; i < rows.length; i += 500) {
      const values = sql.join(
        rows.slice(i, i + 500).map(
          ({ partId, score: s }) => sql`(
            ${partId}::uuid, ${BLENDER_AXIS}, ${s.median}, ${BLENDER_UNIT}, ${s.runs},
            ${s.deviceName}, ${s.backend}, ${BLENDER_VERSION}, ${s.kind === 'gpu'},
            ${BLENDER_SOURCE_URL}, ${snapshotDate}
          )`,
        ),
        sql`, `,
      );
      await tx.execute(sql`
        insert into part_benchmarks
          (part_id, axis, value, unit, runs, device_name, backend, measured_version, per_chip, source_url, snapshot_date)
        values ${values}`);
    }
  });

  return { parts: rows.length, devices: matched.size };
}
