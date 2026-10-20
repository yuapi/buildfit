/**
 * Blender Open Data 집계 — ADR-0023.
 *
 * 1. 이름은 **정확히 같은 것만** 잇는다. 노트북용 GPU는 데스크톱 카드에 붙지 않는다
 * 2. 한 실행 = 세 장면 합. 장면이 빠지거나 장치가 둘인 실행은 뺀다
 * 3. 버전을 섞지 않는다
 * 4. GPU는 실행이 가장 많은 연산 방식을 쓴다
 * 5. 실행 5회 미만은 싣지 않는다
 */

import { describe, expect, it } from 'vitest';
import { aggregateBlender, normalizeDeviceName } from '../src/benchmarks';

describe('normalizeDeviceName', () => {
  it.each([
    ['AMD Ryzen 7 9700X 8-Core Processor', 'AMD Ryzen 7 9700X'],
    ['Intel(R) Core(TM) i9-10900 CPU @ 2.80GHz', 'Intel Core i9 10900'],
    ['AMD Ryzen 5 5500GT with Radeon Graphics', 'AMD Ryzen 5 5500GT'],
    ['NVIDIA GeForce RTX 4070', 'GeForce RTX 4070'],
    ['AMD Radeon RX 7900 XTX', 'Radeon RX 7900 XTX'],
    ['Intel(R) Arc(TM) B580 Graphics', 'Arc B580'],
    // 포장 표기는 칩이 아니다 (이슈 #52)
    ['AMD Ryzen 7 7800X3D 8-Core Processor', 'AMD Ryzen 7 7800X3D OEM/Tray'],
    ['Intel(R) Core(TM) i7-8700K CPU @ 3.70GHz', 'Intel Core i7 8700K OEM / Tray'],
    ['AMD Ryzen 5 5600X 6-Core Processor', 'AMD Ryzen 5 5600X Boxed'],
    ['AMD Ryzen 7 5700X 8-Core Processor', 'AMD Ryzen 7 5700X WOF'],
  ])('Blender의 「%s」와 카탈로그의 「%s」가 같다', (blender, catalog) => {
    expect(normalizeDeviceName(blender)).not.toBeNull();
    expect(normalizeDeviceName(blender)).toBe(normalizeDeviceName(catalog));
  });

  it('포장 낱말은 낱말째로만 걷어낸다 — 이름 속 글자는 두다', () => {
    // 「box」가 들어간 다른 낱말을 자르지 않는다
    expect(normalizeDeviceName('Xbox Series X')).toBe('xbox series x');
  });

  it('다른 모델은 다르다 — 접미사 하나가 다른 제품이다', () => {
    expect(normalizeDeviceName('AMD Ryzen 5 5600')).not.toBe(normalizeDeviceName('AMD Ryzen 5 5600X'));
    expect(normalizeDeviceName('NVIDIA GeForce RTX 4070')).not.toBe(normalizeDeviceName('NVIDIA GeForce RTX 4070 SUPER'));
  });

  it('★ 노트북용은 잇지 않는다 — 걷어내면 데스크톱 카드에 붙는다', () => {
    expect(normalizeDeviceName('NVIDIA GeForce RTX 4070 Laptop GPU')).toBeNull();
    expect(normalizeDeviceName('AMD Radeon RX 6800M Mobile')).toBeNull();
    expect(normalizeDeviceName('NVIDIA GeForce RTX 2080 with Max-Q Design')).toBeNull();
  });

  it('걷어낸 뒤 비면 잇지 않는다 — 무엇인지 모르는 내장 그래픽', () => {
    expect(normalizeDeviceName('AMD Radeon(TM) Graphics')).toBeNull();
  });
});

describe('aggregateBlender', () => {
  const run = (device: string, type: string, spm: [number, number, number], version = '4.5.3 LTS') =>
    JSON.stringify({
      data: (['monster', 'junkshop', 'classroom'] as const).map((scene, i) => ({
        scene: { label: scene },
        stats: { samples_per_minute: spm[i] },
        blender_version: { version },
        device_info: { device_type: type, compute_devices: [{ name: device, type }] },
      })),
    });
  const many = (n: number, device: string, type: string, base: number) =>
    Array.from({ length: n }, (_, i) => run(device, type, [base + i, base + i, base + i]));

  it('★ 한 실행은 세 장면의 합이고, 장치마다 중앙값이다', async () => {
    const lines = many(5, 'NVIDIA GeForce RTX 4070', 'OPTIX', 1000); // 합 3000,3003,…,3012
    const [s] = await aggregateBlender(lines);
    expect(s).toMatchObject({ kind: 'gpu', backend: 'OPTIX', runs: 5, median: 3006 });
  });

  it('★ 실행이 가장 많은 연산 방식을 쓴다 — 점수가 가장 높은 방식이 아니다', async () => {
    // CUDA가 점수는 높지만 5회, OptiX가 6회다. 사용자가 쓰는 방식은 실행이 많은 쪽이다
    const out = await aggregateBlender([
      ...many(6, 'NVIDIA GeForce RTX 4070', 'OPTIX', 1000),
      ...many(5, 'NVIDIA GeForce RTX 4070', 'CUDA', 5000),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ backend: 'OPTIX', runs: 6 });
    expect(out[0]!.median).toBeLessThan(4000);
  });

  it('실행 5회 미만은 싣지 않는다', async () => {
    expect(await aggregateBlender(many(4, 'AMD Radeon RX 7900 XTX', 'HIP', 1000))).toEqual([]);
  });

  it('버전을 섞지 않는다', async () => {
    const lines = Array.from({ length: 5 }, () => run('AMD Ryzen 7 9700X 8-Core Processor', 'CPU', [100, 100, 100], '4.2.0'));
    expect(await aggregateBlender(lines)).toEqual([]);
  });

  it('장면이 빠지거나 장치가 둘인 실행은 뺀다', async () => {
    const partial = JSON.stringify({
      data: [{ scene: { label: 'monster' }, stats: { samples_per_minute: 10 }, blender_version: { version: '4.5.0' }, device_info: { device_type: 'CPU', compute_devices: [{ name: 'X' }] } }],
    });
    const twoGpu = JSON.stringify({
      data: ['monster', 'junkshop', 'classroom'].map((scene) => ({
        scene: { label: scene },
        stats: { samples_per_minute: 10 },
        blender_version: { version: '4.5.0' },
        device_info: { device_type: 'OPTIX', compute_devices: [{ name: 'NVIDIA GeForce RTX 4090' }, { name: 'NVIDIA GeForce RTX 4090' }] },
      })),
    });
    expect(await aggregateBlender([...Array(5).fill(partial), ...Array(5).fill(twoGpu)])).toEqual([]);
  });

  it('CPU와 GPU를 나눈다 — 같은 눈금이 아니다', async () => {
    const out = await aggregateBlender([...many(5, 'AMD Ryzen 7 9700X 8-Core Processor', 'CPU', 100), ...many(5, 'NVIDIA GeForce RTX 4070', 'OPTIX', 1000)]);
    expect(out.map((s) => s.kind).sort()).toEqual(['cpu', 'gpu']);
  });
});
