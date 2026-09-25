import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requiredKeysFor } from '@buildfit/compat';
import { filledPartColumnKeys, partWithSpecs } from '@buildfit/db/queries';
import { Container } from '@/components/SiteShell';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { SpecForm } from './SpecForm';

export const dynamic = 'force-dynamic';

export default async function PartEditor({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ focus?: string }>;
}) {
  // 데이터를 만지기 전에 막는다. 레이아웃에서만 막으면 늦는다 (ADR-0020).
  await requireAdmin();

  const { id } = await params;
  const { focus } = await searchParams;

  const part = await partWithSpecs(getDb(), id);
  if (!part) notFound();

  const byKey = new Map(part.specs.map((s) => [s.key, s]));
  const filled = new Set([...byKey.keys(), ...filledPartColumnKeys(part)]);

  // 필수 필드를 전부 보여준다. 채워진 것도 남겨두어야 저장 직후 확인 메시지가
  // 사라지지 않고, 잘못 넣은 값을 고칠 수도 있다.
  const fields = [...requiredKeysFor(part.category)].sort((a, b) => {
    if (a.specKey === focus) return -1;
    if (b.specKey === focus) return 1;
    const aFilled = filled.has(a.specKey) ? 1 : 0;
    const bFilled = filled.has(b.specKey) ? 1 : 0;
    return aFilled - bFilled; // 비어 있는 것 먼저
  });

  return (
    <Container className="py-10">
      <Link href="/admin" className="link text-sm text-fg-muted">
        ← 빈 필드 목록
      </Link>

      <h1 className="mt-4 text-2xl font-semibold">{part.modelName}</h1>
      <p className="mt-1 text-sm text-fg-subtle">
        {part.category}
        {part.brand ? ` · ${part.brand}` : ''}
        {part.releaseYear ? ` · ${part.releaseYear}` : ''}
      </p>
      {part.manufacturerUrl ? (
        <a
          href={part.manufacturerUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-2 inline-block text-sm link"
        >
          제조사 스펙 페이지 열기 ↗
        </a>
      ) : (
        <p className="mt-2 text-sm text-fg-subtle">
          제조사 스펙 주소가 없습니다. 출처를 직접 찾아야 합니다.
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-medium">
          호환성 판정에 쓰는 필드
          {part.missing.length > 0 && (
            <span className="ml-2 text-sm font-normal text-warn">
              {part.missing.length}개 비어 있음
            </span>
          )}
        </h2>
        <div className="mt-4 space-y-4">
          {fields.map((req) => (
            <SpecForm
              key={req.specKey}
              partId={part.id}
              req={req}
              current={byKey.get(req.specKey)?.value ?? null}
              manufacturerUrl={part.manufacturerUrl}
            />
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">
          전체 스펙 <span className="text-fg-subtle">({part.specs.length})</span>
        </h2>
        <table className="mt-3 w-full text-sm">
          <tbody>
            {part.specs.map((s) => (
              <tr key={s.key} className="border-b border-border">
                <td className="py-1.5 pr-4 text-fg-subtle">{s.key}</td>
                <td className="py-1.5 pr-4 break-all">
                  {JSON.stringify(s.value)}
                  {s.unit ? ` ${s.unit}` : ''}
                </td>
                <td className="py-1.5 text-right text-xs whitespace-nowrap text-fg-subtle">
                  {s.verifiedAt ? `확인 ${s.verifiedAt.toISOString().slice(0, 10)}` : '미확인'}
                  {s.disputed ? ' · 신고됨' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </Container>
  );
}
