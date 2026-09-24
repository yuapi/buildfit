/**
 * @buildfit/db — PostgreSQL 스키마와 접근 계층 (ADR-0011)
 *
 * 마이그레이션 SQL은 `drizzle/`에 커밋된다. 런타임 push에 의존하지 않는다 —
 * 커밋된 SQL이 `autonomous-pipeline-plan.md` §3 리스크 분류의 입력이다.
 */

export * as schema from './schema';
export { parts, partSpecs, partAliases, specReports, partBenchmarks } from './schema';
export { createDb, type Database } from './client';
