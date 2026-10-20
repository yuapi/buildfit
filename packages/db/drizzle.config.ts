import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgres://buildfit:buildfit@localhost:5432/buildfit',
  },
  // 생성되는 SQL이 리스크 분류의 입력이므로 항상 파일로 남긴다 (ADR-0011).
  verbose: true,
  strict: true,
});
