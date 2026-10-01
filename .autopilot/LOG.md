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
