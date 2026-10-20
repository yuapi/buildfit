import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * DB 연결.
 *
 * 개인정보를 다루지 않으므로(ADR-0001) 연결 문자열 외에 다룰 비밀이 없다.
 * 연결 문자열은 환경변수로만 받고 코드·로그에 남기지 않는다.
 */
export function createDb(connectionString: string, opts: { max?: number } = {}) {
  const client = postgres(connectionString, { max: opts.max ?? 10 });
  return { db: drizzle(client, { schema }), client };
}

export type Database = ReturnType<typeof createDb>['db'];
