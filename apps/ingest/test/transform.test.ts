import { describe, expect, it } from 'vitest';
import {
  getPath,
  isFilled,
  normalizeReleaseYear,
  normalizeUrl,
  toPartRow,
  toSlug,
} from '../src/transform';

describe('getPath', () => {
  it('중첩 경로를 읽는다', () => {
    expect(getPath({ a: { b: { c: 1 } } }, 'a.b.c')).toBe(1);
  });
  it('없는 경로는 undefined', () => {
    expect(getPath({ a: 1 }, 'a.b.c')).toBeUndefined();
  });
  it('null을 만나도 던지지 않는다', () => {
    expect(getPath({ a: null }, 'a.b')).toBeUndefined();
  });
});

describe('isFilled', () => {
  it('0과 false는 값이다 — 결측이 아니다', () => {
    expect(isFilled(0)).toBe(true);
    expect(isFilled(false)).toBe(true);
  });
  it('null·빈 배열·빈 문자열은 결측', () => {
    expect(isFilled(null)).toBe(false);
    expect(isFilled([])).toBe(false);
    expect(isFilled('  ')).toBe(false);
  });
});

describe('normalizeReleaseYear', () => {
  const now = new Date('2026-09-18T00:00:00Z');

  it('정상 연도는 통과', () => {
    expect(normalizeReleaseYear(2024, now)).toBe(2024);
  });

  it('OpenDB에 실재하는 오타를 버린다', () => {
    // 조사에서 확인된 실제 값들
    expect(normalizeReleaseYear(20117, now)).toBeNull();
    expect(normalizeReleaseYear(20225, now)).toBeNull();
  });

  it('너무 과거도 버린다', () => {
    expect(normalizeReleaseYear(1970, now)).toBeNull();
  });

  it('숫자가 아니면 null', () => {
    expect(normalizeReleaseYear('2024', now)).toBeNull();
    expect(normalizeReleaseYear(null, now)).toBeNull();
  });
});

describe('toSlug', () => {
  it('소문자-하이픈으로 정규화한다', () => {
    expect(toSlug(['AMD', 'Ryzen 7 9800X3D'])).toBe('amd-ryzen-7-9800x3d');
  });
  it('특수문자를 하이픈으로 접는다', () => {
    expect(toSlug(['G.Skill', 'Trident Z5 (2x16GB)'])).toBe('g-skill-trident-z5-2x16gb');
  });
  it('빈 값은 건너뛴다', () => {
    expect(toSlug([null, 'ASUS', undefined, ''])).toBe('asus');
  });
});

describe('toPartRow', () => {
  const gpuRecord = {
    chipset: 'GeForce RTX 5080',
    length: 337,
    tdp: 360,
    total_slot_width: 3,
    power_connectors: { pcie_6_pin: 0, pcie_8_pin: 0, pcie_12VHPWR: 1, pcie_12V_2x6: 0 },
    metadata: {
      name: 'MSI GAMING TRIO GeForce RTX 5080 16GB',
      manufacturer: 'MSI',
      releaseYear: 2025,
      part_numbers: ['RTX-5080-GAMING-TRIO'],
    },
    identifiers: { identifiers: [{ type: 'mpn', value: 'G50TRIO16', region: 'all' }] },
  };

  it('허용 목록의 스펙만 옮긴다', () => {
    const row = toPartRow('GPU', 'abcdef12-0000-0000-0000-000000000000', gpuRecord);
    const keys = row?.specs.map((s) => s.key).sort();
    expect(keys).toContain('length_mm');
    expect(keys).toContain('pcie_12vhpwr');
    // 허용 목록에 없는 필드는 들어오지 않는다
    expect(keys).not.toContain('video_outputs');
  });

  it('0인 커넥터를 결측으로 버리지 않는다 — 규칙 8 모순 검사의 입력이다', () => {
    const row = toPartRow('GPU', 'abcdef12-0000-0000-0000-000000000000', gpuRecord);
    const six = row?.specs.find((s) => s.key === 'pcie_6_pin');
    expect(six?.value).toBe(0);
  });

  it('MPN을 identifiers에서 뽑는다', () => {
    const row = toPartRow('GPU', 'abcdef12-0000-0000-0000-000000000000', gpuRecord);
    expect(row?.mpn).toBe('G50TRIO16');
  });

  it('slug에 opendb id를 붙여 동일 모델명 충돌을 피한다', () => {
    const row = toPartRow('GPU', 'abcdef12-0000-0000-0000-000000000000', gpuRecord);
    expect(row?.slug.endsWith('-abcdef12')).toBe(true);
  });

  it('이름이 없으면 건너뛴다', () => {
    expect(toPartRow('GPU', 'x', { metadata: {} })).toBeNull();
  });

  it('모르는 카테고리는 건너뛴다', () => {
    expect(toPartRow('Keyboard', 'x', gpuRecord)).toBeNull();
  });
});

describe('0이 물리적으로 불가능한 키 (POSITIVE_ONLY_KEYS)', () => {
  const base = {
    chipset: 'GeForce RTX 4090',
    length: 304,
    tdp: 450,
    core_count: 16384,
    core_boost_clock: 2520,
    memory_bus: 384,
    power_connectors: { pcie_6_pin: 0, pcie_8_pin: 0, pcie_12VHPWR: 1, pcie_12V_2x6: 0 },
    metadata: { name: 'NVIDIA Founders Edition GeForce RTX 4090', manufacturer: 'NVIDIA' },
  };
  const keysOf = (r: Record<string, unknown>) =>
    (toPartRow('GPU', 'aaaaaaaa-0000-0000-0000-000000000000', r)?.specs ?? []).map((s) => s.key);

  it('정상값은 남는다', () => {
    const k = keysOf(base);
    expect(k).toContain('core_boost_clock_mhz');
    expect(k).toContain('memory_bus_bit');
  });

  it('메모리 버스 0bit는 버린다 — 그런 그래픽카드는 없다', () => {
    expect(keysOf({ ...base, memory_bus: 0 })).not.toContain('memory_bus_bit');
  });

  it('부스트 클럭 0MHz는 버린다', () => {
    expect(keysOf({ ...base, core_boost_clock: 0 })).not.toContain('core_boost_clock_mhz');
  });

  it('★ 보조전원 커넥터 0은 버리지 않는다 — 조합 모순이라 규칙 엔진이 판정한다', () => {
    const k = keysOf({
      ...base,
      power_connectors: { pcie_6_pin: 0, pcie_8_pin: 0, pcie_12VHPWR: 0, pcie_12V_2x6: 0 },
    });
    expect(k).toContain('pcie_8_pin');
    expect(k).toContain('pcie_12vhpwr');
  });
});

describe('slug 생성 — 검색 유입용 주소 (§5.2)', () => {
  const slugOf = (brand: string | null, name: string) =>
    toPartRow('CPU', 'abcdef12-0000-0000-0000-000000000000', {
      socket: 'AM5',
      metadata: { name, manufacturer: brand },
    })?.slug;

  it('제조사와 모델명을 잇는다', () => {
    expect(slugOf('AMD', 'Ryzen 7 9800X3D')).toBe('amd-ryzen-7-9800x3d-abcdef12');
  });

  it('제품명이 이미 제조사로 시작하면 겹치지 않는다', () => {
    expect(slugOf('AMD', 'AMD Ryzen 7 9800X3D')).toBe('amd-ryzen-7-9800x3d-abcdef12');
  });

  it('대소문자가 달라도 겹치지 않는다', () => {
    expect(slugOf('Gigabyte', 'GIGABYTE B650 AORUS')).toBe('gigabyte-b650-aorus-abcdef12');
  });

  it('★ 원본에 앞 공백이 있어도 겹치지 않는다 — 실재하는 데이터다', () => {
    expect(slugOf('Gigastone', ' GIGASTONE Game PRO')).toBe('gigastone-game-pro-abcdef12');
  });

  it('제조사가 없으면 모델명만 쓴다', () => {
    expect(slugOf(null, 'Ryzen 7 9800X3D')).toBe('ryzen-7-9800x3d-abcdef12');
  });

  it('opendb id 접미사로 동명이 부품을 구분한다', () => {
    const a = toPartRow('CPU', 'aaaaaaaa-0000-0000-0000-000000000000', {
      metadata: { name: 'Same Name', manufacturer: 'X' },
    })?.slug;
    const b = toPartRow('CPU', 'bbbbbbbb-0000-0000-0000-000000000000', {
      metadata: { name: 'Same Name', manufacturer: 'X' },
    })?.slug;
    expect(a).not.toBe(b);
  });
});

describe('슬롯 폭 0 — 그런 그래픽카드는 없다', () => {
  const keysOf = (pc: Record<string, unknown>) =>
    (
      toPartRow('GPU', 'cccccccc-0000-0000-0000-000000000000', {
        chipset: 'GeForce RTX 4090',
        tdp: 450,
        metadata: { name: 'Test GPU', manufacturer: 'X' },
        ...pc,
      })?.specs ?? []
    ).map((s) => s.key);

  it('정상 슬롯 폭은 남는다', () => {
    const k = keysOf({ total_slot_width: 3, case_expansion_slot_width: 3 });
    expect(k).toContain('total_slot_width');
    expect(k).toContain('case_expansion_slot_width');
  });

  it('0은 버린다 — 비교 화면에 "0슬롯"으로 나가면 안 된다', () => {
    const k = keysOf({ total_slot_width: 0, case_expansion_slot_width: 0 });
    expect(k).not.toContain('total_slot_width');
    expect(k).not.toContain('case_expansion_slot_width');
  });
});

describe('제조사 URL', () => {
  it('http(s)만 통과시킨다', () => {
    expect(normalizeUrl('https://www.msi.com/PC-Case/X/')).toBe('https://www.msi.com/PC-Case/X/');
    expect(normalizeUrl('http://example.com')).toBe('http://example.com');
  });

  it('스킴이 위험하거나 URL이 아니면 버린다 — 화면에서 링크가 되는 값이다', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('data:text/html,<script>')).toBeNull();
    expect(normalizeUrl('그냥 문자열')).toBeNull();
  });

  it('앞뒤 공백과 결측을 처리한다', () => {
    expect(normalizeUrl('  https://example.com  ')).toBe('https://example.com');
    expect(normalizeUrl('')).toBeNull();
    expect(normalizeUrl(null)).toBeNull();
    expect(normalizeUrl(undefined)).toBeNull();
    expect(normalizeUrl(123)).toBeNull();
  });

  it('레코드에서 뽑아 PartRow에 담는다', () => {
    const row = toPartRow('PCCase', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', {
      metadata: { name: 'MSI MPG VELOX 300R', manufacturer: 'MSI' },
      general_product_information: { manufacturer_url: 'https://www.msi.com/PC-Case/X/' },
    });
    expect(row?.manufacturerUrl).toBe('https://www.msi.com/PC-Case/X/');
  });

  it('없으면 null', () => {
    const row = toPartRow('PCCase', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', {
      metadata: { name: 'MSI MPG VELOX 300R', manufacturer: 'MSI' },
    });
    expect(row?.manufacturerUrl).toBeNull();
  });
});

describe('파생 스펙 — 경로 하나로 안 되는 것 (DERIVED_SPECS)', () => {
  const board = (m2: unknown, extra: Record<string, unknown> = {}) => ({
    socket: 'AM5',
    memory: { ram_type: 'DDR5', slots: 4 },
    m2_slots: m2,
    storage_devices: { sata_6_gb_s: 4, sata_3_gb_s: 2 },
    metadata: { name: '테스트 보드', manufacturer: 'ASUS' },
    ...extra,
  });
  const specs = (r: Record<string, unknown>) =>
    new Map(
      (toPartRow('Motherboard', 'bbbbbbbb-0000-0000-0000-000000000000', r)?.specs ?? []).map(
        (s) => [s.key, s.value],
      ),
    );

  it('M.2는 행 수를 담는다 — 슬롯 수가 아니다 (compat-rules §17.4)', () => {
    const s = specs(board([{ size: '2280' }, { size: '2242-2260' }, { size: '2280' }]));
    expect(s.get('m2_slots')).toBe(3);
  });

  it('★ E키 행을 뺀다 — 와이파이 자리에 SSD가 들어가지 않는다 (§17.3)', () => {
    // ASRock B550M-ITX/ac가 2개로 잡히는데 SSD가 들어가는 것은 1개다
    const s = specs(board([
      { size: '2280', key: 'M' },
      { size: '2280', key: 'E' },
    ]));
    expect(s.get('m2_slots')).toBe(1);
  });

  it('M키가 아니어도 E키만 뺀다 — 아는 것만 뺀다', () => {
    const s = specs(board([
      { size: '2280', key: 'M' },
      { size: '2280', key: 'B' },
      { size: '2280' },
    ]));
    expect(s.get('m2_slots')).toBe(3);
  });

  it('E키만 있으면 0이다 — 저장장치 자리가 없다', () => {
    expect(specs(board([{ size: '2230', key: 'E' }])).get('m2_slots')).toBe(0);
  });

  it('★ 빈 배열은 0으로 담는다 — M.2가 없는 보드는 실재한다', () => {
    // DDR3의 86.3%, DDR2의 100%가 0이다. 결측으로 지우면 그 사실이 사라진다
    expect(specs(board([])).get('m2_slots')).toBe(0);
  });

  it('배열이 아니면 담지 않는다', () => {
    expect(specs(board(undefined)).has('m2_slots')).toBe(false);
    expect(specs(board(null)).has('m2_slots')).toBe(false);
    expect(specs(board('2280')).has('m2_slots')).toBe(false);
  });

  describe('m2_accepts — 받는 조합 (compat-rules §17.5, 이슈 #27)', () => {
    it('길이와 방식을 짝지어 정렬된 집합으로 담는다', () => {
      const s = specs(board([
        { size: '2280', key: 'M', interface: 'PCIe 4.0 x4' },
        { size: '2242/2260/2280', key: 'M', interface: 'PCIe 3.0 x4 / SATA' },
      ]));
      expect(s.get('m2_accepts')).toEqual([
        '2242/PCIe', '2242/SATA', '2260/PCIe', '2260/SATA', '2280/PCIe', '2280/SATA',
      ]);
    });

    it('범위는 사이의 표준 길이를 모두 담는다', () => {
      const s = specs(board([{ size: '2242-2260', key: 'M', interface: 'PCIe 4.0 x4' }]));
      expect(s.get('m2_accepts')).toEqual(['2242/PCIe', '2260/PCIe']);
      const t = specs(board([{ size: '2280-22110', key: 'M', interface: 'Gen4 x4' }]));
      expect(t.get('m2_accepts')).toEqual(['22110/PCIe', '2280/PCIe']);
    });

    it('★ 한 슬롯을 크기마다 쪼갠 기록과 합친 기록이 같은 값이다 — 중복 불일치로 잡히지 않는다', () => {
      // ASUS PRIME B650M-A는 4행, 같은 보드의 WIFI II는 2행이다 (§17.4)
      const split = specs(board([
        { size: '2242-2260', key: 'M', interface: 'PCIe 4.0 x4' },
        { size: '2280', key: 'M', interface: 'PCIe 4.0 x4' },
        { size: '2242-2260', key: 'M', interface: 'PCIe 4.0 x4' },
        { size: '2280', key: 'M', interface: 'PCIe 4.0 x4' },
      ]));
      const merged = specs(board([
        { size: '2242/2260/2280', key: 'M', interface: 'PCIe 4.0 x4' },
        { size: '2242/2260/2280', key: 'M', interface: 'PCIe 4.0 x4' },
      ]));
      expect(split.get('m2_accepts')).toEqual(merged.get('m2_accepts'));
    });

    it('M키가 아니거나 모르는 행은 받지 않는다고 본다', () => {
      const s = specs(board([
        { size: '2280', key: 'B', interface: 'SATA' },
        { size: '2280', interface: 'PCIe 4.0 x4' },
        { size: '2230', key: 'E', interface: 'PCIe' },
      ]));
      expect(s.has('m2_accepts')).toBe(false);
    });

    it('폭 25mm 행과 읽을 수 없는 크기는 버린다', () => {
      const s = specs(board([
        { size: '2580-25110', key: 'M', interface: 'PCIe 4.0 x4' },
        { size: '110mm', key: 'M', interface: 'PCIe 4.0 x4' },
        { size: '2280', key: 'M', interface: 'PCIe 4.0 x4' },
      ]));
      expect(s.get('m2_accepts')).toEqual(['2280/PCIe']);
    });

    it('받는 조합이 없으면 담지 않는다 — 규칙 17이 판정 불가로 둔다', () => {
      expect(specs(board([])).has('m2_accepts')).toBe(false);
      expect(specs(board(undefined)).has('m2_accepts')).toBe(false);
    });
  });

  it('SATA는 속도별로 나눠 담는다 — 합산은 규칙 엔진이 한다', () => {
    const s = specs(board([]));
    expect(s.get('sata_ports')).toBe(4);
    expect(s.get('sata_ports_3gbs')).toBe(2);
  });

  it('SATA 0포트도 담는다 — 그런 보드가 실재한다', () => {
    const s = specs(board([], { storage_devices: { sata_6_gb_s: 0, sata_3_gb_s: 0 } }));
    expect(s.get('sata_ports')).toBe(0);
    expect(s.get('sata_ports_3gbs')).toBe(0);
  });
});

describe('Storage 적재', () => {
  const drive = (over: Record<string, unknown> = {}) => ({
    capacity: 2000,
    storage_type: 'SSD',
    form_factor: 'M.2-2280',
    interface: 'M.2 PCIe 4.0 x4',
    nvme: true,
    metadata: { name: '990 PRO 2TB', manufacturer: 'Samsung' },
    ...over,
  });
  const specs = (r: Record<string, unknown>) =>
    new Map(
      (toPartRow('Storage', 'cccccccc-0000-0000-0000-000000000000', r)?.specs ?? []).map(
        (s) => [s.key, s.value],
      ),
    );

  it('판정에 쓰는 필드를 담는다', () => {
    const s = specs(drive());
    expect(s.get('capacity_gb')).toBe(2000);
    expect(s.get('form_factor')).toBe('M.2-2280');
    expect(s.get('storage_type')).toBe('SSD');
    expect(s.get('nvme')).toBe(true);
    expect(s.get('interface')).toBe('M.2 PCIe 4.0 x4');
  });

  it('nvme=false는 값이다 — 결측이 아니다', () => {
    expect(specs(drive({ nvme: false, interface: 'SATA 6.0 Gb/s' })).get('nvme')).toBe(false);
  });

  it('용량 0GB는 버린다 — 그런 드라이브는 없다', () => {
    expect(specs(drive({ capacity: 0 })).has('capacity_gb')).toBe(false);
  });
});
