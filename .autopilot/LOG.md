# LOG (autopilot 실행 기록, append only)

## 2026-10-01T10:20 | 발굴 | 상태 파일 생성
- 베이스라인: typecheck 0 · lint 0 · test 274/439/536 · build 성공. 마커 0, quantakrypto 0
- 발굴: T-1(security, next GHSA-vcvr-r3jv-pc5j), T-2(test, proxy.ts 응답 매핑)
- **레포 규칙과 맞춘 것:** CLAUDE.md가 develop 직접 커밋을 막고 PR 머지를 요구한다. 그래서 작업마다 feature 브랜치에서
  커밋하고, 브랜치를 push해 PR로 머지한다(CI 녹색일 때). 스킬의 「push하지 않는다」보다 레포 규칙을 따른다 —
  클라우드 컨테이너는 사라지므로 push하지 않은 커밋은 남지 않는다

## 2026-10-01T10:35 | T-1 | done
- 변경: apps/web/package.json, package-lock.json (next·eslint-config-next 16.3.5 → 16.3.6, lockfile은 next 계열 12개만)
- 검증: typecheck 0 · lint 0 · test 274/439/536 (변화 없음) · build 성공(Next.js 16.3.6) · security-audit 0건
- 비고: 레포는 `next/og`를 쓰지 않아 취약 경로는 없었다. 취약 범위의 버전이 설치돼 있던 것을 치운다
- 후속: 없음 (T-2는 발굴 때 이미 있음)

## 2026-10-01T10:55 | T-2 | done
- 변경: apps/web/test/proxy.test.ts (새 테스트 5), apps/web/vitest.config.ts (`@/*` 별칭 — tsconfig와 같은 매핑, 새 의존성 없음)
- 검증: typecheck 0 · lint 0 · test 274/439→444/536 · build 성공. 변이 확인 — `cache-control`과 꺼짐 rewrite를 빼면 2건 실패
- 후속: 없음

## 2026-10-01T11:10 | 재발굴 + T-3 | done
- 재발굴: 기계적 소스(실패·린트·마커·보안)는 0. 도메인 문서를 훑어 T-3·T-4(docs) 추가. 고를 때 거르기의 규칙 8·18은 ROADMAP 「하지 않기로」에 사유와 함께
- 변경: README.md — 카탈로그 수치(26,504 / 239,779 / 63,691, 재동기 후), 케이스 데이터 행(이슈 #3 「사람이 채워야」 → ADR-0025 업스트림 동기), 「규칙 15개」 → 20개
- 검증: lint 0 · test 274/444/536 (변화 없음)
- 후속: 없음

## 2026-10-01T11:25 | T-4 | done
- 변경: docs/handoff-guide.md §8.1 — 날짜(09-24 → 10-01), 닫은 이슈 #62~#93 추가, `main`과의 거리(316 → 457 커밋), 「도구」 행(MCP 서버·autopilot 상태 파일·레포 규칙 우선)
- 검증: lint 0 · test 274/444/536 (변화 없음)
- 후속: 없음. BACKLOG에 open이 0 — 다음 실행은 발굴부터

## 2026-10-01T11:40 | 재발굴 + T-5 | done
- 재발굴: 무작위 견적 1,500개 — 새 데이터 문제 없음 (규칙 3·17 오류는 실재 불일치, 규칙 8 경고는 변환 케이블 경우). T-5(docs) 추가
- 변경: CLAUDE.md — 견적서 확정 72.6% → 73.1%(n=435, #85), 중복 537건(2.03%) → 536건(2.02%, 재동기·#87 후), disputed 272행 → 「처음 272, 지금 총계 287」
- 검증: lint 0 · test 274/444/536 (변화 없음)
- 후속: 없음

## 2026-10-01T12:00 | T-6 | done
- 변경: packages/compat/src/search.ts `KO_ALIASES`에 제품군 24개, quote 테스트 예시(버려지는 말 → 「한정판」), 견적서 SQL 테스트, docs/research/korean-search-terms.md §5.3
- 실측: 한글 제품군이 든 56줄 — 확정 71.7% → 73.1%, 여럿일 때 평균 후보 3.8 → 2.8, 단일 오답 0. 견적서 SQL 테스트가 「에어로」로 EAGLE을 기대하던 옛 오답을 바로잡음
- 검증: lint 0 · typecheck · test 275/444/537
- 후속: 없음

## 2026-10-01T12:20 | 재발굴 + T-7 | done | skill 1.3.0
- 재발굴: 베이스라인 typecheck 0 · lint 0 · test 275/444/537 · build 성공. 마커 0 · security-audit 0 · quantakrypto 266파일 0. 실질 작업 3개 — T-7·T-8(test), T-9(cleanup)
- 변경: packages/compat/test/verdict.test.ts (새 파일, 8개) — `summarize`의 info 분리 집계, 빈 결과, 엔진 수준 규칙 12 Flashback → `counts.info` 1, `unknown`의 빈 notes, 사유 종류, `isFilled`
- 변이 확인: `summarize`의 `info` 증가를 지우면 새 테스트 2개만 실패, 기존 537개는 전부 통과 — 공백이 실재했다
- 검증: typecheck 0 · lint 0 · test 275/444/545
- 후속: 없음 (T-8·T-9는 발굴 때 넣음)

## 2026-10-01T12:40 | T-8 | done | skill 1.3.0
- 변경: apps/web/test/admin-auth.test.ts (새 파일, 5개) — `server-only`·`next/headers`·`next/navigation`을 mock해 ok·open은 통과, unauthorized(틀린 비밀·비밀 없음)·disabled는 `notFound()`
- 변이 확인: `disabled`를 통과로 바꾸면 1개, `notFound()`를 지우면 3개 실패 — 기존 444개는 둘 다 전부 통과했다
- 검증: typecheck 0 · lint 0 · test 275/449/545 · build 성공
- 후속: 없음

## 2026-10-01T13:00 | T-9 | done | skill 1.4.0
- 변경: apps/web/src/lib/categories.ts — `metaForSlot` 삭제. Phase 0b(4979505)에서 생긴 뒤 참조 0 (레포 전체 grep: 정의 한 줄뿐). 앱 내부 모듈이라 공개 인터페이스가 아니다
- 검증: typecheck 0 · lint 0 · test 275/449/545 · build 성공 (베이스라인과 같음)
- 후속: 없음. BACKLOG에 open 0 — 다음 실행은 재발굴(1.4.0의 제품 축 포함)부터
