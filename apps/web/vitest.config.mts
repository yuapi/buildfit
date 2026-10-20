import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `tsconfig.json`의 `@/*` → `./src/*`를 테스트에서도 푼다.
 * 이것이 없으면 `@/`로 import하는 모듈(예: `src/proxy.ts`)을 시험할 수 없다.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
