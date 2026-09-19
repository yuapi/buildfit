/** 테스트용 부품. 전부 채워진 정상 조합을 기준으로 두고 필요한 필드만 덮어쓴다. */

import type { Build, Cpu, CpuCooler, Gpu, Motherboard, PcCase, Psu, RamKit } from '../src/parts';

export const cpu: Cpu = {
  id: 'cpu-1',
  name: 'AMD Ryzen 7 9800X3D',
  socket: 'AM5',
  tdp: 120,
  ppt: 162,
  memoryTypes: ['DDR5'],
};

export const motherboard: Motherboard = {
  id: 'mb-1',
  name: 'MSI MAG B650 TOMAHAWK WIFI',
  socket: 'AM5',
  formFactor: 'ATX',
  memoryType: 'DDR5',
  memorySlots: 4,
};

export const ramKit: RamKit = {
  id: 'ram-1',
  name: 'G.Skill Trident Z5 DDR5-6000 CL30 32GB (2x16GB)',
  ramType: 'DDR5',
  moduleCount: 2,
  heightMm: 44,
};

export const gpu: Gpu = {
  id: 'gpu-1',
  name: 'MSI GAMING TRIO GeForce RTX 5080 16GB',
  chipset: 'GeForce RTX 5080',
  lengthMm: 337,
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
};

export const psu: Psu = {
  id: 'psu-1',
  name: 'Corsair RM850x (2024)',
  wattage: 850,
  formFactor: 'ATX',
  connectors: { pcie6plus2: 4, pcie12vhpwr: 1 },
};

export const cooler: CpuCooler = {
  id: 'cooler-1',
  name: 'Noctua NH-D15 G2',
  heightMm: 160,
  waterCooled: false,
  supportedSockets: ['AM5', 'LGA1700', 'LGA1851'],
};

export const goodBuild: Build = {
  cpu,
  motherboard,
  ram: [ramKit],
  gpu,
  pcCase,
  psu,
  cooler,
};

/** 기준 견적에서 일부만 바꾼 견적. */
export function withBuild(patch: Partial<Build>): Build {
  return { ...goodBuild, ...patch };
}
