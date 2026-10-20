'use server';

import { SPEC_REQUIREMENTS } from '@buildfit/compat';
import { createSpecReport, reportTarget } from '@buildfit/db/part';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { getDb } from '@/lib/db';
import { clientIp, RateLimiter } from '@/lib/rate-limit';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 신고는 IP당 10건을 몰아 쓰고 6분에 하나씩 찬다 (시간당 약 10건, 이슈 #115).
 * 브라우저 토큰은 클라이언트가 정하는 값이라 중복 방지만 하고 남용은 못 막는다 —
 * 토큰을 바꿔 가며 보내면 부품마다 「검증 중」을 세울 수 있었다.
 */
const reportLimiter = new RateLimiter({ capacity: 10, refillPerSecond: 1 / 360 });

export interface ReportResult {
  readonly ok: boolean;
  readonly message: string;
}

/**
 * 스펙 오류 신고 — §5.5.
 *
 * 로그인이 없으므로(ADR-0001) 신고자를 식별하지 않는다. 브라우저 토큰으로
 * 중복만 막는다.
 */
export async function reportSpecAction(
  _prev: ReportResult | null,
  form: FormData,
): Promise<ReportResult> {
  const partId = String(form.get('partId') ?? '');
  const specKey = String(form.get('specKey') ?? '').trim();
  /**
   * 여러 개를 고르는 항목(지원 폼팩터 등)은 값이 **여러 번** 온다.
   * `get()`은 첫 것만 집으므로 「ATX, SFX」가 「ATX」로 줄어든다.
   */
  const reportedValue = form
    .getAll('reportedValue')
    .map((v) => String(v).trim())
    .filter((v) => v !== '')
    .join(', ');
  const note = String(form.get('note') ?? '').trim();
  const clientToken = String(form.get('clientToken') ?? '').trim().slice(0, 64);

  if (!UUID.test(partId) || !specKey || specKey.length > 64) {
    return { ok: false, message: '어느 항목이 잘못됐는지 골라 주세요.' };
  }

  if (!reportLimiter.take(clientIp(await headers()))) {
    return { ok: false, message: '신고가 너무 많습니다. 잠시 후 다시 시도해 주세요.' };
  }

  /**
   * 카테고리·slug는 폼이 아니라 DB에서 읽는다 (이슈 #115). 폼 값은 클라이언트가 바꿀 수 있다 —
   * 다른 카테고리를 적으면 아래 허용값 검사를 비켜 가고, 아무 경로나 다시 그리게 할 수 있었다.
   */
  let target: Awaited<ReturnType<typeof reportTarget>>;
  try {
    target = await reportTarget(getDb(), partId);
  } catch {
    return { ok: false, message: '지금은 신고를 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  }
  if (!target) return { ok: false, message: '없는 부품입니다.' };
  const { category, slug } = target;

  // 화면이 고르게 하는 항목만 받는다 — 이 부품에 있는 스펙이거나, 규칙이 읽는 항목
  const knownKey =
    target.specKeys.includes(specKey) ||
    SPEC_REQUIREMENTS.some((r) => r.category === category && r.specKey === specKey);
  if (!knownKey) return { ok: false, message: '어느 항목이 잘못됐는지 골라 주세요.' };

  /**
   * 정해진 목록이 있는 항목은 **그 목록 밖의 값을 받지 않는다.**
   *
   * 규칙 5·6은 이 값을 글자 그대로 비교하므로 `atx`나 `ATX 파워`는 못 읽는다
   * (`requirements.ts`의 `options` 주석). 화면이 고르게 하지만 폼 데이터는
   * 클라이언트가 만드는 것이라 여기서 한 번 더 본다.
   *
   * 설명란은 자유다 — 목록에 없는 값은 거기에 적어 달라고 안내한다.
   */
  const req = SPEC_REQUIREMENTS.find((r) => r.category === category && r.specKey === specKey);
  if (req?.options && reportedValue !== '') {
    const allowed = new Set<string>(req.options);
    const bad = reportedValue.split(', ').filter((v) => !allowed.has(v));
    if (bad.length > 0) {
      // 조사를 붙이지 않는다. 값이 영문이라 읽는 소리를 알 수 없고,
      // "(은)는"은 이 프로젝트가 피하려는 바로 그 문장이다 (lib/korean.ts).
      return {
        ok: false,
        message: `이 항목에서 쓰지 않는 값입니다 — ${bad.join(', ')}. 목록에서 골라 주세요.`,
      };
    }
  }
  if (!reportedValue && !note) {
    return { ok: false, message: '맞다고 생각하는 값이나 설명 중 하나는 적어 주세요.' };
  }
  if (note.length > 500 || reportedValue.length > 200) {
    return { ok: false, message: '내용이 너무 깁니다.' };
  }

  try {
    await createSpecReport(getDb(), {
      partId,
      specKey,
      reportedValue: reportedValue || null,
      note: note || null,
      clientToken: clientToken || 'anonymous',
    });
  } catch {
    return { ok: false, message: '지금은 신고를 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  }

  revalidatePath(`/part/${category.toLowerCase()}/${slug}`);
  revalidatePath('/admin');
  return { ok: true, message: '신고했습니다. 확인 후 반영하겠습니다.' };
}
