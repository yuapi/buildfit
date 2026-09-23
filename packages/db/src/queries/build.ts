/**
 * DB 행 → 규칙 엔진 입력 변환.
 *
 * 규칙 엔진(`@buildfit/compat`)은 DB를 모른다 (ADR-0010). 그 경계를 여기서 잇는다.
 * `part_specs`의 key-value를 타입 있는 부품 객체로 조립한다.
 *
 * **스펙 키 이름은 적재 매핑(`apps/ingest/src/mapping.ts`)과 맞아야 한다.**
 * 어긋나면 값이 있는데도 결측으로 읽혀 판정 불가가 된다.
 */

import type {
  Build,
  Cpu,
  CpuCooler,
  Gpu,
  Motherboard,
  PcCase,
  PartRef,
  Psu,
  RamKit,
  StorageDrive,
} from '@buildfit/compat';
import { inArray } from 'drizzle-orm';
import type { Database } from '../client';
import { partSpecs, parts } from '../schema';

interface RawPart {
  readonly id: string;
  readonly category: string;
  readonly modelName: string;
  readonly slug: string;
  /** 스펙이 아니라 parts 컬럼이다. 규칙 12가 쓴다 */
  readonly releaseYear: number | null;
  readonly specs: ReadonlyMap<string, unknown>;
  /** 「검증 중」이 선 스펙 키 (이슈 #13). 판정에는 쓰지 않고 결과에 덧붙는다 */
  readonly contested: readonly string[];
}

/**
 * 모든 부품 타입이 공유하는 머리 부분.
 *
 * 여덟 변환 함수가 같은 세 줄을 반복하고 있었다. `contestedSpecs`를 붙일 때
 * 하나를 빠뜨리면 그 카테고리만 조용히 표시가 빠진다.
 */
function ref(p: RawPart): PartRef {
  return { id: p.id, name: p.modelName, slug: p.slug, contestedSpecs: p.contested };
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

function bool(specs: ReadonlyMap<string, unknown>, key: string): boolean | null {
  const v = specs.get(key);
  if (typeof v === 'boolean') return v;
  // JSONB를 문자열로 돌려주는 드라이버 경로가 있다. false를 결측으로 떨구지 않는다.
  if (v === 'true') return true;
  if (v === 'false') return false;
  return null;
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
      releaseYear: parts.releaseYear,
    })
    .from(parts)
    .where(inArray(parts.id, unique));

  const specRows = await db
    .select({
      partId: partSpecs.partId,
      key: partSpecs.key,
      value: partSpecs.value,
      disputed: partSpecs.disputed,
    })
    .from(partSpecs)
    .where(inArray(partSpecs.partId, unique));

  const specsById = new Map<string, Map<string, unknown>>();
  const contestedById = new Map<string, string[]>();
  for (const s of specRows) {
    let m = specsById.get(s.partId);
    if (!m) {
      m = new Map();
      specsById.set(s.partId, m);
    }
    m.set(s.key, s.value);
    if (s.disputed) {
      const keys = contestedById.get(s.partId);
      if (keys) keys.push(s.key);
      else contestedById.set(s.partId, [s.key]);
    }
  }

  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        category: r.category,
        modelName: r.modelName,
        slug: r.slug,
        releaseYear: r.releaseYear,
        specs: specsById.get(r.id) ?? new Map(),
        contested: contestedById.get(r.id) ?? [],
      },
    ]),
  );
}

function toCpu(p: RawPart): Cpu {
  return {
    ...ref(p),
    socket: str(p.specs, 'socket'),
    tdp: num(p.specs, 'tdp_w'),
    ppt: num(p.specs, 'ppt_w'),
    memoryTypes: strArray(p.specs, 'memory_types'),
    memoryMaxGb: num(p.specs, 'memory_max_gb'),
    releaseYear: p.releaseYear,
    integratedGraphics: str(p.specs, 'integrated_graphics'),
    includesCooler: bool(p.specs, 'includes_cooler'),
  };
}

function toMotherboard(p: RawPart): Motherboard {
  return {
    ...ref(p),
    socket: str(p.specs, 'socket'),
    formFactor: str(p.specs, 'form_factor'),
    memoryType: str(p.specs, 'memory_type'),
    memorySlots: num(p.specs, 'memory_slots'),
    memoryMaxGb: num(p.specs, 'memory_max_gb'),
    m2Slots: num(p.specs, 'm2_slots'),
    sataPorts: num(p.specs, 'sata_ports'),
    sataPorts3Gbs: num(p.specs, 'sata_ports_3gbs'),
    releaseYear: p.releaseYear,
    biosFlashback: bool(p.specs, 'bios_flashback'),
  };
}

function toRamKit(p: RawPart): RamKit {
  return {
    ...ref(p),
    ramType: str(p.specs, 'ram_type'),
    moduleCount: num(p.specs, 'module_count'),
    capacityGb: num(p.specs, 'capacity_gb'),
    heightMm: num(p.specs, 'height_mm'),
    formFactor: str(p.specs, 'form_factor'),
  };
}

function toGpu(p: RawPart): Gpu {
  return {
    ...ref(p),
    chipset: str(p.specs, 'chipset'),
    lengthMm: num(p.specs, 'length_mm'),
    totalSlotWidth: num(p.specs, 'total_slot_width'),
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
    ...ref(p),
    formFactor: str(p.specs, 'form_factor'),
    supportedMoboFormFactors: strArray(p.specs, 'supported_mobo_form_factors'),
    supportedPsuFormFactors: strArray(p.specs, 'supported_psu_form_factors'),
    maxGpuLengthMm: num(p.specs, 'max_gpu_length_mm'),
    maxCpuCoolerHeightMm: num(p.specs, 'max_cpu_cooler_height_mm'),
    expansionSlots: num(p.specs, 'expansion_slots'),
    internal35Bays: num(p.specs, 'internal_3_5_bays'),
    internal25Bays: num(p.specs, 'internal_2_5_bays'),
  };
}

function toStorage(p: RawPart): StorageDrive {
  return {
    ...ref(p),
    formFactor: str(p.specs, 'form_factor'),
    interface: str(p.specs, 'interface'),
    storageType: str(p.specs, 'storage_type'),
    capacityGb: num(p.specs, 'capacity_gb'),
  };
}

function toPsu(p: RawPart): Psu {
  return {
    ...ref(p),
    wattage: num(p.specs, 'wattage_w'),
    formFactor: str(p.specs, 'form_factor'),
    connectors: {
      pcie6plus2: num(p.specs, 'pcie_6_plus_2_pin'),
      pcie12vhpwr: num(p.specs, 'pcie_12vhpwr'),
    },
  };
}

function toCpuCooler(p: RawPart): CpuCooler {
  return {
    ...ref(p),
    heightMm: num(p.specs, 'height_mm'),
    waterCooled: bool(p.specs, 'water_cooled'),
    supportedSockets: strArray(p.specs, 'cpu_sockets'),
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
  readonly cooler?: string | undefined;
  readonly storage?: readonly string[] | undefined;
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
    sel.cooler,
    ...(sel.ram ?? []),
    ...(sel.storage ?? []),
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
  const cooler = pick(sel.cooler, 'CPUCooler');
  const ram = (sel.ram ?? [])
    .map((id) => pick(id, 'RAM'))
    .filter((p): p is RawPart => p !== null);
  const storage = (sel.storage ?? [])
    .map((id) => pick(id, 'Storage'))
    .filter((p): p is RawPart => p !== null);

  return {
    cpu: cpu ? toCpu(cpu) : null,
    motherboard: mb ? toMotherboard(mb) : null,
    ram: ram.map(toRamKit),
    gpu: gpu ? toGpu(gpu) : null,
    pcCase: pcCase ? toPcCase(pcCase) : null,
    psu: psu ? toPsu(psu) : null,
    cooler: cooler ? toCpuCooler(cooler) : null,
    storage: storage.map(toStorage),
  };
}
