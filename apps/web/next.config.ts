import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 규칙 엔진과 DB 계층을 빌드하지 않은 TS 소스로 가져온다.
  // 클라이언트와 서버가 같은 판정 코드를 쓴다 (ADR-0010).
  transpilePackages: ["@buildfit/compat", "@buildfit/db"],

  // Next가 apps/web에 CLAUDE.md·AGENTS.md를 생성하지 않게 한다.
  // 이 레포의 세션 컨텍스트는 루트 CLAUDE.md 하나다. 두 벌이면 다음 세션이
  // 어느 쪽을 따를지 알 수 없다.
  agentRules: false,
};

export default nextConfig;
