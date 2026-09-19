/**
 * 공유 URL 코드 — ADR-0012.
 *
 * 견적의 정본은 공유 URL이다 (`pc-builder-spec.md` §8A.3). 서버에 견적을 저장하지
 * 않으므로 구성 전체가 이 코드 안에 들어간다.
 *
 * **v1의 의미는 절대 바뀌지 않는다.** 이미 뿌려진 링크를 우리가 고칠 수 없다.
 * 부품 종류를 늘려야 하면 v2를 새로 만들고 v1 디코더는 그대로 둔다.
 */

/**
 * 새로 만드는 코드의 버전. **읽기는 v1도 계속 지원한다.**
 *
 * v2에서 CPU 쿨러 슬롯이 늘었다 (`docs/compat-rules.md` §9.4).
 */
export const BUILD_CODE_VERSION = 2;

export interface BuildSelection {
  readonly cpu?: string | undefined;
  readonly motherboard?: string | undefined;
  readonly gpu?: string | undefined;
  readonly pcCase?: string | undefined;
  readonly psu?: string | undefined;
  readonly ram?: readonly string[] | undefined;
  /** v2에서 추가. v1 코드에는 없다 */
  readonly cooler?: string | undefined;
}

/**
 * 단일 슬롯 순서. **버전마다 고정이다.**
 * 순서를 바꾸면 기존 링크가 다른 부품을 가리킨다.
 *
 * v1은 영원히 이 다섯 개다. 이미 뿌려진 링크를 우리가 고칠 수 없다 (ADR-0012).
 */
const SLOTS_V1 = ['cpu', 'motherboard', 'gpu', 'pcCase', 'psu'] as const;

/** v2 = v1 + 쿨러. **앞의 다섯 개 순서를 그대로 둔다** — 디코더를 공유한다. */
const SLOTS_V2 = [...SLOTS_V1, 'cooler'] as const;

type Slot = (typeof SLOTS_V2)[number];

/** 메모리는 개수가 가변이라 단일 슬롯 뒤의 비트를 따로 쓴다. 버전마다 위치가 다르다. */
const RAM_BIT_V1 = 1 << SLOTS_V1.length;
const RAM_BIT_V2 = 1 << SLOTS_V2.length;

const SLOTS = SLOTS_V2;
const RAM_BIT = RAM_BIT_V2;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidToBytes(uuid: string): Uint8Array | null {
  if (!UUID_RE.test(uuid)) return null;
  const hex = uuid.replace(/-/g, '');
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToUuid(bytes: Uint8Array, offset: number): string {
  let hex = '';
  for (let i = 0; i < 16; i += 1) {
    hex += (bytes[offset + i] ?? 0).toString(16).padStart(2, '0');
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(code)) return null;
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** 견적 구성 → URL 코드. 고르지 않은 슬롯은 비트마스크에서 빠진다. */
export function encodeBuildCode(sel: BuildSelection): string {
  const single: { slot: Slot; bytes: Uint8Array }[] = [];
  let mask = 0;

  SLOTS.forEach((slot, i) => {
    const id = sel[slot];
    if (typeof id !== 'string') return;
    const bytes = uuidToBytes(id);
    if (!bytes) return;
    mask |= 1 << i;
    single.push({ slot, bytes });
  });

  const ramIds = (sel.ram ?? [])
    .map((id) => uuidToBytes(id))
    .filter((b): b is Uint8Array => b !== null)
    .slice(0, 255);
  if (ramIds.length > 0) mask |= RAM_BIT;

  const size = 2 + single.length * 16 + (ramIds.length > 0 ? 1 + ramIds.length * 16 : 0);
  const buf = new Uint8Array(size);
  buf[0] = BUILD_CODE_VERSION;
  buf[1] = mask;

  let at = 2;
  for (const { bytes } of single) {
    buf.set(bytes, at);
    at += 16;
  }
  if (ramIds.length > 0) {
    buf[at] = ramIds.length;
    at += 1;
    for (const bytes of ramIds) {
      buf.set(bytes, at);
      at += 16;
    }
  }
  return toBase64Url(buf);
}

/**
 * URL 코드 → 견적 구성.
 *
 * **실패하면 `null`이다. 던지지 않는다.** 깨진 링크로 앱이 죽으면 안 된다
 * (ADR-0012 규칙 3). 호출 측은 이것을 "판정 불가"가 아니라 "읽을 수 없는 링크"로
 * 구분해 보여준다.
 */
export function decodeBuildCode(code: string): BuildSelection | null {
  const buf = fromBase64Url(code);
  if (!buf || buf.length < 2) return null;

  // 버전마다 슬롯 배치가 다르다. **v1을 지우지 않는다** — 이미 뿌려진 링크가 있다.
  // 모르는 버전은 조용히 실패한다. 미래 버전 코드를 아는 척 읽으면 엉뚱한 부품이 나온다.
  const layout =
    buf[0] === 1
      ? { slots: SLOTS_V1 as readonly Slot[], ramBit: RAM_BIT_V1 }
      : buf[0] === 2
        ? { slots: SLOTS_V2 as readonly Slot[], ramBit: RAM_BIT_V2 }
        : null;
  if (!layout) return null;

  const mask = buf[1] ?? 0;
  const out: Record<string, unknown> = {};
  let at = 2;

  for (let i = 0; i < layout.slots.length; i += 1) {
    if ((mask & (1 << i)) === 0) continue;
    if (at + 16 > buf.length) return null;
    out[layout.slots[i]!] = bytesToUuid(buf, at);
    at += 16;
  }

  if ((mask & layout.ramBit) !== 0) {
    if (at >= buf.length) return null;
    const count = buf[at] ?? 0;
    at += 1;
    if (count === 0 || at + count * 16 > buf.length) return null;
    const ram: string[] = [];
    for (let i = 0; i < count; i += 1) {
      ram.push(bytesToUuid(buf, at));
      at += 16;
    }
    out['ram'] = ram;
  }

  // 남는 바이트가 있으면 손상된 코드다.
  if (at !== buf.length) return null;
  // 쓰지 않는 비트가 서 있으면 우리가 모르는 배치다. 절반만 읽고 넘기지 않는다.
  const knownBits = (1 << layout.slots.length) - 1;
  if ((mask & ~(knownBits | layout.ramBit)) !== 0) return null;
  return out as BuildSelection;
}
