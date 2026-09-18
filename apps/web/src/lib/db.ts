import 'server-only';
import { createDb, type Database } from '@buildfit/db';

let cached: Database | undefined;

/** 서버 전용 DB 핸들. 개발 중 HMR로 연결이 쌓이지 않게 모듈 수준에서 재사용한다. */
export function getDb(): Database {
  if (!cached) {
    const url = process.env['DATABASE_URL'];
    if (!url) throw new Error('DATABASE_URL이 설정되지 않았습니다. .env.example을 참고하세요.');
    cached = createDb(url).db;
  }
  return cached;
}
