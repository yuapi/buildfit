/** 테스트용 부품. 전부 채워진 정상 조합을 기준으로 두고 필요한 필드만 덮어쓴다. */

import type {
  Build, Cpu, CpuCooler, Gpu, Motherboard, PcCase, Psu, RamKit, StorageDrive,
} from '../src/parts';

export const cpu: Cpu = {
  id: 'cpu-1',
  name: 'AMD Ryzen 7 9800X3D',
  socket: 'AM5',
  tdp: 120,
  ppt: 162,
  memoryTypes: ['DDR5'],
  memoryMaxGb: 256,
  releaseYear: 2024,
  integratedGraphics: 'AMD Radeon Graphics',
  includesCooler: false,
};

export const motherboard: Motherboard = {
  id: 'mb-1',
  name: 'MSI MAG B650 TOMAHAWK WIFI',
  socket: 'AM5',
  formFactor: 'ATX',
  memoryType: 'DDR5',
  memorySlots: 4,
  memoryMaxGb: 256,
  m2Slots: 3,
  m2Accepts: ['2242/PCIe', '2260/PCIe', '2280/PCIe'],
  sataPorts: 6,
  sataPorts3Gbs: 0,
  releaseYear: 2024,
  socketFirstYear: 2022,
  biosFlashback: true,
};

export const ramKit: RamKit = {
  id: 'ram-1',
  name: 'G.Skill Trident Z5 DDR5-6000 CL30 32GB (2x16GB)',
  ramType: 'DDR5',
  moduleCount: 2,
  capacityGb: 32,
  heightMm: 44,
  formFactor: '288-pin DIMM',
};

export const gpu: Gpu = {
  id: 'gpu-1',
  name: 'MSI GAMING TRIO GeForce RTX 5080 16GB',
  chipset: 'GeForce RTX 5080',
  lengthMm: 337,
  totalSlotWidth: 2.5,
  tdp: 360,
  connectors: { pcie6: 0, pcie8: 0, pcie12vhpwr: 1, pcie12v2x6: 0 },
};

export const pcCase: PcCase = {
  id: 'case-1',
  name: 'Lian Li O11 Dynamic EVO',
  formFactor: 'ATX Mid Tower',
  supportedMoboFormFactors: ['ATX', 'Micro ATX', 'Mini-ITX', 'EATX'],
  supportedPsuFormFactors: ['ATX', 'SFX', 'SFX-L'],
  maxGpuLengthMm: 420,
  maxCpuCoolerHeightMm: 167,
  maxPsuLengthMm: 200,
  expansionSlots: 8,
  internal35Bays: 6,
  internal25Bays: 3,
};

export const psu: Psu = {
  id: 'psu-1',
  name: 'Corsair RM850x (2024)',
  wattage: 850,
  formFactor: 'ATX',
  lengthMm: 160,
  connectors: { pcie6plus2: 4, pcie12vhpwr: 1 },
};

export const cooler: CpuCooler = {
  id: 'cooler-1',
  name: 'Noctua NH-D15 G2',
  heightMm: 160,
  waterCooled: false,
  supportedSockets: ['AM5', 'LGA1700', 'LGA1851'],
  fanQuantity: 2,
  fanless: false,
  lighting: ['None'],
};

export const drive: StorageDrive = {
  id: 'ssd-1',
  name: 'Samsung 990 PRO 2TB',
  formFactor: 'M.2-2280',
  interface: 'M.2 PCIe 4.0 x4',
  storageType: 'SSD',
  capacityGb: 2000,
};

export const sataDrive: StorageDrive = {
  id: 'hdd-1',
  name: 'Seagate BarraCuda 4TB',
  formFactor: '3.5"',
  interface: 'SATA 6.0 Gb/s',
  storageType: 'HDD',
  capacityGb: 4000,
};

export const goodBuild: Build = {
  cpu,
  motherboard,
  ram: [ramKit],
  gpu,
  pcCase,
  psu,
  cooler,
  storage: [drive],
};

/** 기준 견적에서 일부만 바꾼 견적. */
export function withBuild(patch: Partial<Build>): Build {
  return { ...goodBuild, ...patch };
}
