/**
 * DB 행 → 규칙 엔진 입력 변환.
 *
 * 규칙 엔진(`@buildfit/compat`)은 DB를 모른다 (ADR-0010). 그 경계를 여기서 잇는다.
 * `part_specs`의 key-value를 타입 있는 부품 객체로 조립한다.
 *
 * **스펙 키 이름은 적재 매핑(`apps/ingest/src/mapping.ts`)과 맞아야 한다.**
 * 어긋나면 값이 있는데도 결측으로 읽혀 판정 불가가 된다.
 */

import type { Build, Cpu, Gpu, Motherboard, PcCase, Psu, RamKit } from '@buildfit/compat';
import { inArray } from 'drizzle-orm';
import type { Database } from '../client';
import { partSpecs, parts } from '../schema';

interface RawPart {
  readonly id: string;
  readonly category: string;
  readonly modelName: string;
  readonly slug: string;
  readonly specs: ReadonlyMap<string, unknown>;
}

function num(specs: ReadonlyMap<string, unknown>, key: string): number | null {
  const v = specs.get(key);
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  // JSONB는 숫자를 문자열로 돌려주는 경우가 있다.
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function str(specs: ReadonlyMap<string, unknown>, key: string): string | null {
  const v = specs.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function strArray(specs: ReadonlyMap<string, unknown>, key: string): readonly string[] | null {
  const v = specs.get(key);
  if (!Array.isArray(v)) return null;
  const out = v.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  return out.length > 0 ? out : null;
}

/** 여러 부품을 한 번에 읽어 스펙까지 붙인다. */
async function loadRaw(db: Database, ids: readonly string[]): Promise<Map<string, RawPart>> {
  const unique = [...new Set(ids)].filter((id) => id !== '');
  if (unique.length === 0) return new Map();

  const rows = await db
    .select({
      id: parts.id,
      category: parts.category,
      modelName: parts.modelName,
      slug: parts.slug,
    })
    .from(parts)
    .where(inArray(parts.id, unique));

  const specRows = await db
    .select({ partId: partSpecs.partId, key: partSpecs.key, value: partSpecs.value })
    .from(partSpecs)
    .where(inArray(partSpecs.partId, unique));

  const specsById = new Map<string, Map<string, unknown>>();
  for (const s of specRows) {
    let m = specsById.get(s.partId);
    if (!m) {
      m = new Map();
      specsById.set(s.partId, m);
    }
    m.set(s.key, s.value);
  }

  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        category: r.category,
        modelName: r.modelName,
        slug: r.slug,
        specs: specsById.get(r.id) ?? new Map(),
      },
    ]),
  );
}

function toCpu(p: RawPart): Cpu {
  return {
    id: p.id,
    name: p.modelName,
    slug: p.slug,
    socket: str(p.specs, 'socket'),
    tdp: num(p.specs, 'tdp_w'),
    ppt: num(p.specs, 'ppt_w'),
    memoryTypes: strArray(p.specs, 'memory_types'),
  };
}

function toMotherboard(p: RawPart): Motherboard {
  return {
    id: p.id,
    name: p.modelName,
    slug: p.slug,
    socket: str(p.specs, 'socket'),
    formFactor: str(p.specs, 'form_factor'),
    memoryType: str(p.specs, 'memory_type'),
    memorySlots: num(p.specs, 'memory_slots'),
  };
}

function toRamKit(p: RawPart): RamKit {
  return {
    id: p.id,
    name: p.modelName,
    slug: p.slug,
    ramType: str(p.specs, 'ram_type'),
    moduleCount: num(p.specs, 'module_count'),
    heightMm: num(p.specs, 'height_mm'),
  };
}

function toGpu(p: RawPart): Gpu {
  return {
    id: p.id,
    name: p.modelName,
    slug: p.slug,
    chipset: str(p.specs, 'chipset'),
    lengthMm: num(p.specs, 'length_mm'),
    tdp: num(p.specs, 'tdp_w'),
    connectors: {
      pcie6: num(p.specs, 'pcie_6_pin'),
      pcie8: num(p.specs, 'pcie_8_pin'),
      pcie12vhpwr: num(p.specs, 'pcie_12vhpwr'),
      pcie12v2x6: num(p.specs, 'pcie_12v_2x6'),
    },
  };
}

function toPcCase(p: RawPart): PcCase {
  return {
    id: p.id,
    name: p.modelName,
    slug: p.slug,
    formFactor: str(p.specs, 'form_factor'),
    supportedMoboFormFactors: strArray(p.specs, 'supported_mobo_form_factors'),
    supportedPsuFormFactors: strArray(p.specs, 'supported_psu_form_factors'),
    maxGpuLengthMm: num(p.specs, 'max_gpu_length_mm'),
    maxCpuCoolerHeightMm: num(p.specs, 'max_cpu_cooler_height_mm'),
  };
}

function toPsu(p: RawPart): Psu {
  return {
    id: p.id,
    name: p.modelName,
    slug: p.slug,
    wattage: num(p.specs, 'wattage_w'),
    formFactor: str(p.specs, 'form_factor'),
    connectors: {
      pcie6plus2: num(p.specs, 'pcie_6_plus_2_pin'),
      pcie12vhpwr: num(p.specs, 'pcie_12vhpwr'),
    },
  };
}

/** 고르지 않은 부품은 생략하거나 `undefined`로 둔다. */
export interface BuildSelection {
  readonly cpu?: string | undefined;
  readonly motherboard?: string | undefined;
  readonly ram?: readonly string[] | undefined;
  readonly gpu?: string | undefined;
  readonly pcCase?: string | undefined;
  readonly psu?: string | undefined;
}

/**
 * 견적 구성을 DB에서 읽어 규칙 엔진 입력으로 만든다.
 *
 * 고르지 않은 부품은 `null`이고, id가 DB에 없어도 `null`이다 —
 * 둘 다 "판정할 대상이 없음"이라 규칙이 결과에서 빠진다 (결측과 다르다).
 */
export async function loadBuild(db: Database, sel: BuildSelection): Promise<Build> {
  const ids = [
    sel.cpu,
    sel.motherboard,
    sel.gpu,
    sel.pcCase,
    sel.psu,
    ...(sel.ram ?? []),
  ].filter((v): v is string => typeof v === 'string');

  const raw = await loadRaw(db, ids);
  const pick = (id: string | undefined, category: string): RawPart | null => {
    if (!id) return null;
    const p = raw.get(id);
    return p && p.category === category ? p : null;
  };

  const cpu = pick(sel.cpu, 'CPU');
  const mb = pick(sel.motherboard, 'Motherboard');
  const gpu = pick(sel.gpu, 'GPU');
  const pcCase = pick(sel.pcCase, 'PCCase');
  const psu = pick(sel.psu, 'PSU');
  const ram = (sel.ram ?? [])
    .map((id) => pick(id, 'RAM'))
    .filter((p): p is RawPart => p !== null);

  return {
    cpu: cpu ? toCpu(cpu) : null,
    motherboard: mb ? toMotherboard(mb) : null,
    ram: ram.map(toRamKit),
    gpu: gpu ? toGpu(gpu) : null,
    pcCase: pcCase ? toPcCase(pcCase) : null,
    psu: psu ? toPsu(psu) : null,
  };
}
