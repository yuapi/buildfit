/**
 * 후보 좁히기 SQL — ADR-0016.
 *
 * `pickerConstraints`가 만든 제약을 DB가 어떻게 옮기는지 검증한다.
 * **가장 중요한 성질은 "스펙이 없으면 남긴다"**이다. 이 방향이 뒤집히면
 * 값이 비어 있다는 이유로 멀쩡한 부품이 목록에서 사라지고, 사용자는 그
 * 부품을 찾을 방법이 없어진다.
 *
 * DB가 필요하다. `DATABASE_URL`이 없으면 건너뛴다 — CI에는 항상 있다.
 */

import type { Constraint } from '@buildfit/compat';
import { createDb } from '@buildfit/db';
import { searchCandidates } from '@buildfit/db/picker';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createScratchDb, type Scratch } from './helpers/scratch-db';

const describeIfDb = process.env['DATABASE_URL'] ? describe : describe.skip;

if (process.env['CI'] === 'true' && !process.env['DATABASE_URL']) {
  throw new Error('CI인데 DATABASE_URL이 없다. 후보 좁히기 검증이 조용히 빠진다.');
}

describeIfDb('후보 좁히기 SQL (ADR-0016)', () => {
  let scratch: Scratch;
  let db: ReturnType<typeof createDb>['db'];
  let close: () => Promise<void>;

  beforeAll(async () => {
    scratch = await createScratchDb();
    const made = createDb(scratch.url, { max: 2 });
    db = made.db;
    close = () => made.client.end();

    // 소켓이 있는 것 둘, 없는 것 하나. 배열·숫자 스펙도 한 벌씩 심는다.
    await db.execute(sql`
      insert into parts (id, slug, category, model_name) values
        ('11111111-1111-4111-8111-111111111111', 'cpu-am5',  'CPU', 'AM5 씨피유'),
        ('22222222-2222-4222-8222-222222222222', 'cpu-lga',  'CPU', 'LGA 씨피유'),
        ('33333333-3333-4333-8333-333333333333', 'cpu-none', 'CPU', '소켓 모르는 씨피유'),
        ('44444444-4444-4444-8444-444444444444', 'case-atx', 'PCCase', 'ATX 케이스'),
        ('55555555-5555-4555-8555-555555555555', 'case-itx', 'PCCase', 'ITX 케이스'),
        ('66666666-6666-4666-8666-666666666666', 'case-none','PCCase', '지원 폼팩터 모르는 케이스'),
        ('77777777-7777-4777-8777-777777777777', 'gpu-short','GPU', '짧은 그래픽카드'),
        ('88888888-8888-4888-8888-888888888888', 'gpu-long', 'GPU', '긴 그래픽카드'),
        ('99999999-9999-4999-8999-999999999999', 'gpu-none', 'GPU', '길이 모르는 그래픽카드'),
        ('aaaaaaaa-0000-4000-8000-00000000000a', 'cpu-jsonnull', 'CPU', 'JSON 널 씨피유'),
        ('aaaaaaaa-0000-4000-8000-00000000000b', 'cpu-empty',    'CPU', '빈 문자열 씨피유'),
        ('aaaaaaaa-0000-4000-8000-00000000000c', 'cpu-number',   'CPU', '숫자 소켓 씨피유'),
        ('aaaaaaaa-0000-4000-8000-00000000000d', 'case-emptyarr','PCCase', '빈 배열 케이스'),
        ('aaaaaaaa-0000-4000-8000-00000000000e', 'gpu-strnum',   'GPU', '문자열 길이 그래픽카드'),
        ('aaaaaaaa-0000-4000-8000-00000000000f', 'gpu-mm-slots', 'GPU', '두께에 mm를 적은 그래픽카드'),
        ('aaaaaaaa-0000-4000-8000-000000000010', 'gpu-thick',    'GPU', '두꺼운 그래픽카드'),
        ('aaaaaaaa-0000-4000-8000-000000000011', 'gpu-thin',     'GPU', '얇은 그래픽카드')
    `);
    await db.execute(sql`
      insert into part_specs (part_id, key, value) values
        ('11111111-1111-4111-8111-111111111111', 'socket', '"AM5"'::jsonb),
        ('22222222-2222-4222-8222-222222222222', 'socket', '"LGA 1700"'::jsonb),
        ('44444444-4444-4444-8444-444444444444', 'supported_mobo_form_factors', '["ATX","Micro ATX"]'::jsonb),
        ('55555555-5555-4555-8555-555555555555', 'supported_mobo_form_factors', '["Mini-ITX"]'::jsonb),
        ('77777777-7777-4777-8777-777777777777', 'length_mm', '250'::jsonb),
        ('88888888-8888-4888-8888-888888888888', 'length_mm', '400'::jsonb),
        -- 스키마가 허용하는 나쁜 값들. 지금 데이터엔 없지만 SQL이 유일한 방어선이다
        ('aaaaaaaa-0000-4000-8000-00000000000a', 'socket', 'null'::jsonb),
        ('aaaaaaaa-0000-4000-8000-00000000000b', 'socket', '""'::jsonb),
        ('aaaaaaaa-0000-4000-8000-00000000000c', 'socket', '1700'::jsonb),
        ('aaaaaaaa-0000-4000-8000-00000000000d', 'supported_mobo_form_factors', '[]'::jsonb),
        ('aaaaaaaa-0000-4000-8000-00000000000e', 'length_mm', '"400"'::jsonb),
        -- 규칙 15: 슬롯 자리에 mm를 적은 레코드가 실재한다 (4건). docs/compat-rules.md §15.2
        ('aaaaaaaa-0000-4000-8000-00000000000f', 'total_slot_width', '120'::jsonb),
        ('aaaaaaaa-0000-4000-8000-000000000010', 'total_slot_width', '3.5'::jsonb),
        ('aaaaaaaa-0000-4000-8000-000000000011', 'total_slot_width', '2'::jsonb)
    `);
  }, 60_000);

  afterAll(async () => {
    await close?.();
    await scratch?.drop();
  });

  const names = async (category: string, constraints: Constraint[]) => {
    const page = await searchCandidates(db, { category, query: '', constraints });
    return { names: page.items.map((i) => i.name).sort(), hidden: page.hidden };
  };

  it('equals — 어긋나는 것만 빼고 결측·빈값·타입 불일치는 남긴다', async () => {
    const r = await names('CPU', [
      { kind: 'equals', key: 'socket', value: 'AM5', ruleId: 1, because: '보드 소켓' },
    ]);
    // 'null'::jsonb, '""', 숫자 1700은 전부 "값이 없거나 못 읽는 것"이다.
    // 이것들을 어긋남으로 세면 값이 빈 부품이 조용히 사라진다 (ADR-0016).
    expect(r.names).toEqual([
      'AM5 씨피유',
      'JSON 널 씨피유',
      '빈 문자열 씨피유',
      '소켓 모르는 씨피유',
      '숫자 소켓 씨피유',
    ]);
    expect(r.hidden).toBe(1);
  });

  it('contains — 배열에 없으면 빼고, 배열 스펙이 없으면 남긴다', async () => {
    const r = await names('PCCase', [
      { kind: 'contains', key: 'supported_mobo_form_factors', value: 'ATX', ruleId: 5, because: '보드 폼팩터' },
    ]);
    // 빈 배열은 아무것도 말하지 않는다. 숨기면 안 된다.
    expect(r.names).toEqual(['ATX 케이스', '빈 배열 케이스', '지원 폼팩터 모르는 케이스']);
    expect(r.hidden).toBe(1);
  });

  it('atMost — 넘는 것만 빼고 길이 모르는 것은 남긴다', async () => {
    const r = await names('GPU', [
      { kind: 'atMost', key: 'length_mm', value: 300, ruleId: 4, because: '케이스 한계' },
    ]);
    // 두께 부품들은 길이 스펙이 없다. 없으면 남는 것이 이 테스트가 지키는 성질이다
    expect(r.names).toEqual(['길이 모르는 그래픽카드', '두꺼운 그래픽카드', '두께에 mm를 적은 그래픽카드', '문자열 길이 그래픽카드', '얇은 그래픽카드', '짧은 그래픽카드']);
    expect(r.hidden).toBe(1);
  });

  it('★ atMost + ignoreAbove — 단위를 잘못 적은 값은 숨기지 않는다 (§15.2)', async () => {
    const r = await names('GPU', [
      { kind: 'atMost', key: 'total_slot_width', value: 3, ignoreAbove: 5, ruleId: 15, because: '케이스 확장 슬롯 3칸' },
    ]);
    // 3.5슬롯은 3칸에 안 들어가니 빠진다. 120은 mm를 적은 것이라 판정 대상이 아니다 —
    // 규칙이 판정 불가로 두는 값을 거르기가 숨기면 그 부품을 찾을 길이 없다.
    expect(r.names).toContain('두께에 mm를 적은 그래픽카드');
    expect(r.names).toContain('얇은 그래픽카드');
    expect(r.names).not.toContain('두꺼운 그래픽카드');
    expect(r.hidden).toBe(1);
  });

  it('ignoreAbove가 없으면 예전 그대로 — 넘으면 전부 뺀다', async () => {
    const r = await names('GPU', [
      { kind: 'atMost', key: 'total_slot_width', value: 3, ruleId: 15, because: '상한 없음' },
    ]);
    expect(r.names).not.toContain('두께에 mm를 적은 그래픽카드');
    expect(r.hidden).toBe(2);
  });

  it('atLeast — 방향이 뒤집혀도 결측은 남는다', async () => {
    const r = await names('GPU', [
      { kind: 'atLeast', key: 'length_mm', value: 300, ruleId: 4, because: '최소 길이' },
    ]);
    expect(r.names).toEqual(['긴 그래픽카드', '길이 모르는 그래픽카드', '두꺼운 그래픽카드', '두께에 mm를 적은 그래픽카드', '문자열 길이 그래픽카드', '얇은 그래픽카드']);
    expect(r.hidden).toBe(1);
  });

  it('oneOf — 목록 밖이면 빼고 결측은 남긴다', async () => {
    const r = await names('CPU', [
      { kind: 'oneOf', key: 'socket', values: ['AM5', 'AM4'], ruleId: 1, because: '케이스 지원' },
    ]);
    expect(r.names).toEqual([
      'AM5 씨피유',
      'JSON 널 씨피유',
      '빈 문자열 씨피유',
      '소켓 모르는 씨피유',
      '숫자 소켓 씨피유',
    ]);
  });

  it('제약이 없으면 전부 나온다', async () => {
    const r = await names('CPU', []);
    expect(r.names).toHaveLength(6);
    expect(r.hidden).toBe(0);
  });

  it('제약 여러 개는 모두 만족해야 남는다', async () => {
    const r = await names('GPU', [
      { kind: 'atMost', key: 'length_mm', value: 300, ruleId: 4, because: 'a' },
      { kind: 'atLeast', key: 'length_mm', value: 200, ruleId: 4, because: 'b' },
    ]);
    expect(r.names).toEqual(['길이 모르는 그래픽카드', '두꺼운 그래픽카드', '두께에 mm를 적은 그래픽카드', '문자열 길이 그래픽카드', '얇은 그래픽카드', '짧은 그래픽카드']);
  });
});
