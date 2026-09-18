import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 규칙 엔진은 빌드하지 않은 TS 소스로 가져온다.
  // 클라이언트와 서버가 같은 코드를 쓴다 (ADR-0010).
  transpilePackages: ["@buildfit/compat"],
};

export default nextConfig;
