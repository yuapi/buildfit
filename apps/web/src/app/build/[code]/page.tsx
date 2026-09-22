import Link from 'next/link';
import { evaluate } from '@buildfit/compat';
import { loadBuild } from '@buildfit/db/build';
import { BuildTool } from '@/app/BuildTool';
import { Container } from '@/components/SiteShell';
import { decodeBuildCode } from '@/lib/build-code';
import { buildLabel, buildSummary, nameOf } from '@/lib/build-summary';
import { SLOT_META } from '@/lib/categories';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** 링크를 읽지 못했을 때. 아래 `generateMetadata`가 되돌아오는 자리다 */
const FALLBACK = {
  title: '공유된 견적',
  description: '링크로 받은 PC 견적의 호환성·소비전력 판정.',
};

/**
 * 링크 미리보기에 **무엇이 들어 있고 판정이 어떻게 났는지** 적는다.
 *
 * 공유가 이 도구의 주된 전파 경로인데 카카오톡·디스코드에 붙이면 전부
 * 「공유된 견적」이라는 같은 미리보기만 떴다. 링크를 받은 사람이 열어보기
 * 전에는 아무것도 알 수 없었다.
 *
 * **던지지 않는다.** 여기서 실패하면 페이지 자체가 죽는데, 본문은 DB가
 * 죽어도 안내를 띄우도록 만들어져 있다 (ADR-0012 규칙 4).
 */
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const selection = decodeBuildCode(code);
    if (!selection) return FALLBACK;

    const build = await loadBuild(getDb(), selection);
    const label = buildLabel(build);
    if (label === '빈 견적') return FALLBACK;

    const description = buildSummary(build, evaluate(build));
    return {
      title: label,
      description,
      // 링크 미리보기는 og를 먼저 본다. 제목·설명을 같은 것으로 맞춘다.
      openGraph: { title: `${label} — buildfit`, description },
    };
  } catch {
    return FALLBACK;
  }
}

/** 링크가 깨진 것, DB가 죽은 것, 부품이 사라진 것은 사용자가 할 행동이 다르다. */
function Problem({ title, detail }: { title: string; detail: string }) {
  return (
    <Container width="narrow" className="py-20">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-fg-muted">{detail}</p>
      <Link href="/" className="btn btn-primary mt-6">
        새로 견적 구성하기
      </Link>
    </Container>
  );
}

export default async function SharedBuild({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const selection = decodeBuildCode(code);

  // ADR-0012 규칙 4: 깨진 링크로 앱이 죽지 않는다.
  if (!selection) {
    return (
      <Problem
        title="이 링크를 읽을 수 없습니다"
        detail="링크가 잘리거나 손상된 것 같습니다. 원본 링크를 다시 확인해 주세요."
      />
    );
  }

  // DB가 죽어도 "링크가 깨졌다"고 말하지 않는다.
  let build;
  try {
    build = await loadBuild(getDb(), selection);
  } catch {
    return (
      <Problem
        title="지금은 견적을 불러올 수 없습니다"
        detail="링크는 정상입니다. 잠시 후 다시 열어 주세요."
      />
    );
  }

  // 링크는 읽었는데 부품이 하나도 없으면 DB 쪽 문제다. 위와 구분해 안내한다.
  const found =
    [build.cpu, build.motherboard, build.gpu, build.pcCase, build.psu, build.cooler].filter(Boolean)
      .length + build.ram.length;

  if (found === 0) {
    return (
      <Problem
        title="담긴 부품을 찾지 못했습니다"
        detail="링크는 읽었지만 그 안의 부품이 없습니다. 데이터가 갱신되면서 사라졌을 수 있습니다."
      />
    );
  }

  // 고른 것만 한 줄로 요약한다. 아래 구성 도구가 같은 목록을 이미 보여주므로
  // '없음' 줄까지 늘어놓으면 같은 표가 두 번 나온다.
  const summary = SLOT_META.map((m) => ({
    label: m.label,
    // 여럿이면 몇 개인지까지 말한다. 화면과 미리보기가 같은 함수를 쓴다
    name: nameOf(build, m.slot),
  })).filter((x) => x.name);

  return (
    <Container className="py-10 sm:py-14">
      <header>
        <p className="text-xs font-medium tracking-wide text-fg-subtle">공유된 견적</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          {summary
            .slice(0, 2)
            .map((s) => s.name)
            .join(' + ') || '견적'}
        </h1>
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {summary.map((s) => (
            <li key={s.label} className="chip max-w-full">
              {/* 이름표는 줄이지 않는다. 줄어드는 것은 부품 이름 쪽이다 */}
              <span className="shrink-0 text-fg-subtle">{s.label}</span>
              <span className="min-w-0 truncate text-fg">{s.name}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-fg-subtle">
          이어서 고치면 내 견적이 됩니다. 원본 링크는 그대로 남습니다.
        </p>
      </header>

      <div className="mt-8">
        {/* 그대로 이어서 수정할 수 있게 구성 도구를 같은 상태로 연다. */}
        <BuildTool initial={build} />
      </div>
    </Container>
  );
}
