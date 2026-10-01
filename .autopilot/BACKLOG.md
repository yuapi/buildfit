# BACKLOG (autopilot 작업 큐)

next_id: 3

상태: open | in_progress | done | blocked
유형: fix | security | test | lint | todo | cleanup | docs | refactor

| ID | 유형 | 상태 | 시도 | 작업 | 완료 기준 | 출처 | 완료일 |
|---|---|---|---|---|---|---|---|
| T-1 | security | done | 1 | `next`·`eslint-config-next` 16.3.5 → 16.3.6 (GHSA-vcvr-r3jv-pc5j) | 두 package.json·lockfile이 16.3.6, security-audit에 next 항목 없음, typecheck·lint·test·build 베이스라인 유지 | security-audit MCP | 2026-10-01 |
| T-2 | test | done | 1 | `apps/web/src/proxy.ts` 응답 매핑 테스트 — ok/open → next, disabled → `/__admin-off` rewrite, 그 밖 → 401 + `www-authenticate` Basic + `cache-control: no-store` | 새 테스트가 세 갈래를 모두 확인하고 통과, 기존 테스트 유지 | 테스트 공백 | 2026-10-01 |
