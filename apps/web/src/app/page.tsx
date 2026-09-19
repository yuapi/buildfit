import Link from 'next/link';
import { BuildTool } from './BuildTool';

export const metadata = {
  title: 'buildfit — PC 견적 검증',
  description: 'PC 부품 조합의 호환성과 소비전력을 판정합니다. 가격 비교가 아니라 판단을 돕는 도구입니다.',
};

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header>
        <h1 className="text-2xl font-semibold">buildfit</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          이 조합, 문제 없나? 부품을 고르면 호환성과 소비전력을 판정합니다.
          가격 비교가 아니라 판단을 돕는 도구입니다.
        </p>
        <p className="mt-3 text-sm">
          <Link href="/part" className="underline underline-offset-2">
            부품 목록 둘러보기
          </Link>
        </p>
      </header>

      <div className="mt-8">
        <BuildTool />
      </div>

      <footer className="mt-16 border-t border-neutral-200 pt-6 text-xs text-neutral-500 dark:border-neutral-800">
        부품 데이터 출처:{' '}
        <a
          href="https://github.com/buildcores/buildcores-open-db"
          className="underline underline-offset-2"
        >
          BuildCores OpenDB
        </a>{' '}
        (ODC-By 1.0)
      </footer>
    </main>
  );
}
