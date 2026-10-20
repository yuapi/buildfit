import type { NextConfig } from "next";
import { STATIC_SECURITY_HEADERS } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  // 규칙 엔진과 DB 계층을 빌드하지 않은 TS 소스로 가져온다.
  // 클라이언트와 서버가 같은 판정 코드를 쓴다 (ADR-0010).
  transpilePackages: ["@buildfit/compat", "@buildfit/db"],

  // Next가 apps/web에 CLAUDE.md·AGENTS.md를 생성하지 않게 한다.
  // 이 레포의 세션 컨텍스트는 루트 CLAUDE.md 하나다. 두 벌이면 다음 세션이
  // 어느 쪽을 따를지 알 수 없다.
  agentRules: false,

  // 무엇으로 만들었는지 알리지 않는다 (이슈 #115)
  poweredByHeader: false,

  // 이미지 최적화를 쓰지 않는다 (`next/image`가 없다). 켜 두면 /_next/image가 남의 주소를
  // 대신 받아 오는 통로가 된다 — 16.3까지 SSRF 취약점이 있던 경로다 (이슈 #115)
  images: { unoptimized: true },

  // CSP는 요청마다 nonce가 달라 proxy가 붙인다. 나머지는 모든 응답에 같다 (ADR-0026)
  async headers() {
    return [{ source: "/:path*", headers: [...STATIC_SECURITY_HEADERS] }];
  },
};

export default nextConfig;
