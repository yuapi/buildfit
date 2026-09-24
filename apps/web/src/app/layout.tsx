import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { SiteFooter, SiteHeader } from '@/components/SiteShell';
import { siteUrl } from '@/lib/site';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: 'buildfit — PC 견적 검증',
    template: '%s — buildfit',
  },
  description:
    'PC 부품 조합의 호환성과 소비전력을 판정합니다. 가격 비교가 아니라 판단을 돕는 도구입니다.',
  openGraph: {
    type: 'website',
    siteName: 'buildfit',
    locale: 'ko_KR',
  },
};

/**
 * 첫 페인트 전에 테마를 적용한다 (ADR-0014).
 *
 * React가 붙은 뒤에 하면 밝은 화면이 한 번 번쩍인다. 스토리지가 막혀 있어도
 * 던지지 않고 시스템 설정으로 떨어진다 (§8A.4).
 */
const THEME_BOOTSTRAP = `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        {/*
          본문 랜드마크는 여기 하나다. 없으면 화면 낭독기가 「본문으로」 건너뛸 곳이 없고,
          페이지 안의 <header>가 사이트 머리글(banner)과 겹쳐 두 개로 읽힌다 (axe).
          페이지는 <main>을 따로 두지 않는다 — 겹치면 본문이 둘이 된다
        */}
        <main id="main" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
