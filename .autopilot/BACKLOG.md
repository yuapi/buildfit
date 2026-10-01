# BACKLOG (autopilot 작업 큐)

next_id: 10

상태: open | in_progress | done | blocked
유형: fix | security | test | lint | todo | cleanup | docs | refactor

| ID | 유형 | 상태 | 시도 | 작업 | 완료 기준 | 출처 | 완료일 |
|---|---|---|---|---|---|---|---|
| T-1 | security | done | 1 | `next`·`eslint-config-next` 16.3.5 → 16.3.6 (GHSA-vcvr-r3jv-pc5j) | 두 package.json·lockfile이 16.3.6, security-audit에 next 항목 없음, typecheck·lint·test·build 베이스라인 유지 | security-audit MCP | 2026-10-01 |
| T-2 | test | done | 1 | `apps/web/src/proxy.ts` 응답 매핑 테스트 — ok/open → next, disabled → `/__admin-off` rewrite, 그 밖 → 401 + `www-authenticate` Basic + `cache-control: no-store` | 새 테스트가 세 갈래를 모두 확인하고 통과, 기존 테스트 유지 | 테스트 공백 | 2026-10-01 |
| T-3 | docs | done | 1 | README 상태표·문서표 현행화 — 케이스 데이터 행(이슈 #3 「사람이 채워야」 → ADR-0025 업스트림 동기), 「규칙 15개」 → 20개, 카탈로그 수치 | 세 행이 현재 사실과 맞고 날짜가 있다, 테스트 유지 | 문서 공백 | 2026-10-01 |
| T-4 | docs | done | 1 | handoff-guide §8.1 「넘길 때의 상태」를 현재로 — 날짜, 닫은 이슈(#59 이후), 열린 이슈, MCP·autopilot 상태 | 표의 날짜·이슈 목록이 GitHub와 맞는다 | 문서 공백 | 2026-10-01 |
| T-5 | docs | done | 1 | CLAUDE.md의 낡은 수치 — 중복 537건 → 실측, 견적서 확정 72.6% → 73.1%(#85 재측정), disputed 272행 → 실측 | 세 수치가 실측·출처와 맞고 날짜가 있다, 테스트 유지 | 문서 공백 (재발굴) | 2026-10-01 |
| T-6 | fix | done | 1 | 견적서·검색 사전에 GPU·보드 제품군 한글 이름 24개 (벤투스·트리오·박격포·스트릭스…) | 각 영문이 카탈로그에 걸린다, measure:quote 단일 오답 0 유지, 한글 줄을 옛 사전 대비 실측 | 견적서 매칭 (조사 §5) | 2026-10-01 |
| T-7 | test | done | 1 | `packages/compat/src/verdict.ts` 단위 테스트 — `summarize`가 정보 등급 실패를 `info`로 따로 세는지(이슈 #83, 화면이 `fail - info`를 문제로 셈), 빈 결과, `unknown`이 빈 notes를 싣지 않는지, 엔진 수준에서 규칙 12 Flashback 정보가 `counts.info` 1이 되는지 | 새 테스트 통과, `summarize`의 `info` 증가를 지우면 실패한다(변이 확인), 기존 테스트 유지 | 테스트 공백 — `counts.info`를 0 아닌 값으로 확인하는 테스트 0건 | 2026-10-01 |
| T-8 | test | done | 1 | `apps/web/src/lib/admin-auth.ts` `requireAdmin` 테스트 — `next/headers`·`next/navigation`·`server-only`를 mock해 ok/open은 통과, disabled/unauthorized는 `notFound()` | 네 갈래 확인, 기존 테스트 유지 | 테스트 공백 — 어드민 2차 문지기에 테스트 0건 (ADR-0020) | 2026-10-01 |
| T-9 | cleanup | done | 1 | `apps/web/src/lib/categories.ts`의 `metaForSlot` 삭제 — Phase 0b(4979505) 이후 참조 0 | 레포 전체 grep 참조 0 확인 후 삭제, typecheck·lint·test·build 유지 | 죽은 코드 | 2026-10-01 |
