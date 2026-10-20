import type { BuildSelection } from '@buildfit/db/build';
import { MAX_RAM_KITS, MAX_STORAGE_DRIVES } from './multi-slot';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SINGLE_SLOTS = ['cpu', 'motherboard', 'gpu', 'pcCase', 'psu', 'cooler'] as const;

/**
 * 클라이언트가 보낸 선택을 믿지 않는다 (이슈 #115).
 *
 * uuid 모양이 아닌 id는 버리고, 여러 개를 담는 칸은 화면의 상한(`multi-slot.ts`)으로 자른다.
 * 자르지 않으면 id 수만큼 쿼리 조건이 늘어 요청 하나가 DB를 오래 붙든다.
 */
export function sanitizeSelection(raw: unknown): BuildSelection {
  if (raw === null || typeof raw !== 'object') return {};
  const sel = raw as Record<string, unknown>;
  const one = (v: unknown): string | undefined =>
    typeof v === 'string' && UUID.test(v) ? v : undefined;
  const many = (v: unknown, max: number): string[] =>
    Array.isArray(v)
      ? v.filter((id): id is string => typeof id === 'string' && UUID.test(id)).slice(0, max)
      : [];
  const out: Record<string, unknown> = {};
  for (const slot of SINGLE_SLOTS) {
    const id = one(sel[slot]);
    if (id) out[slot] = id;
  }
  const ram = many(sel['ram'], MAX_RAM_KITS);
  if (ram.length > 0) out['ram'] = ram;
  const storage = many(sel['storage'], MAX_STORAGE_DRIVES);
  if (storage.length > 0) out['storage'] = storage;
  return out as BuildSelection;
}
