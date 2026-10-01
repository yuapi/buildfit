# ROADMAP (autopilot 자동 생성)

last_scan: 2026-10-01

## 제품 (2026-10-01, skill 1.4.0 첫 제품 이해)

**무엇을 하는가.** PC 부품 조합이 실제로 맞는지 판정하는 웹 도구다. 부품을 고르거나
쇼핑몰 견적서를 붙여 넣으면 20개 호환성 규칙이 통과·경고·오류·판정 불가로 답하고,
전력과 한국 누진 요금 기준 전기요금을 계산한다. 가격 비교는 하지 않는다(ADR-0022).
회원가입이 없고, 견적은 URL 코드와 브라우저 저장소에만 남는다.

### 기능 지도

| 기능 | 완성도 | 근거 |
|---|---|---|
| 견적 구성·판정 (20규칙) | 완성 | `apps/web/src/app/BuildTool.tsx`, `packages/compat/src/rules.ts` |
| 고를 때 안 맞는 후보 거르기 | 완성 | `packages/compat/src/picker.ts` (규칙 8·18은 하지 않기로) |
| 견적서 붙여넣기 | 완성 | `packages/compat/src/quote.ts` |
| 한국어 검색 | 완성 | `packages/compat/src/search.ts` |
| 공유 링크 | 완성 | `/build/[code]`, `apps/web/src/lib/build-code.ts` |
| 로컬 저장 (저장·최근·작업 중·설정) | 완성 | `apps/web/src/lib/storage.ts` |
| 저장 목록 내보내기·가져오기 | **없음** | 명세 §8A.3 Phase 1 → T-11·T-12 |
| 전력·전기요금 | 완성 | `/calc/power`, `packages/compat/src/power.ts` |
| 부품 상세 + 호환 목록 | **부분** | CPU↔보드 소켓만. 소켓 등가 표를 안 써 Threadripper 33개가 빈다 → T-10 |
| 두 부품 비교 + 렌더링 측정값 | 완성 | `/compare/[a]/vs/[b]` |
| 검사 규칙·데이터 현황 | 완성 | `/rules` |
| 어드민 (빈 필드 보강·어긋난 값) | 완성 | `/admin`, ADR-0020 |
| `/guide/:topic` | 비워 둠 (의도) | 명세 §8 — 사람이 쓰는 글, 지어내지 않는다 |

### 빠진 것
- 저장 견적 목록 백업 (명세 §8A.3이 Phase 1로 적었다) → T-11·T-12

### 약한 것
- 부품 페이지 호환 목록이 공유 소켓 표를 우회한다 → T-10
- 호환 목록이 CPU·메인보드에만 있다 (쿨러·메모리·케이스 등은 없음). 명세가 카테고리별 대조 축을 정하지 않아 **설계가 먼저다** — 이번 사이클에서는 큐에 넣지 않는다

## 현재 상태 요약
- 베이스라인: typecheck 0 err · lint 0 err · test 275 / 444 / 537 pass · `next build` 성공
- 코드 마커(TODO·FIXME·HACK·XXX): 0건
- quantakrypto: 266파일, 발견 0
- security-audit: 0건 (next 16.3.6, T-1에서 올림)

## 우선 개선 영역
- 재발굴 (2026-10-01, 4회차, skill 1.4.0): 베이스라인 typecheck 0 · lint 0 · test 275/449/545. 마커 0, quantakrypto 0.
  security-audit MCP는 이번 세션 연결 실패(타임아웃) — 직전 사이클(같은 날) 0건, 그 뒤 의존성 변경 없음. 열린 GitHub 이슈 0
- 제품 축: T-10(fix, 호환 목록 소켓 등가), T-11·T-12(feature, 백업) — `features/build-backup.md`

## 하지 않기로 한 것
- 다른 파일에서 안 쓰는 export 20개 (예: `GapPart`, `PickerPage`, `MAX_CANDIDATES`, `lookupPrefix`) — 대부분 공개 함수의 반환·인자 타입이고, export를 지우는 것은 공개 인터페이스 변경이다
- 테스트 파일명과 안 맞는 모듈 중 `gaps.ts`(다른 이름으로 import해 시험됨)·`benchmarks-cli.ts`·`verify-stability.ts`·`measure-quote.ts`(CLI 진입점) — 공백이 아니다
- 고를 때 거르기의 규칙 8(보조전원) — 오류 구간이 키 하나의 경계가 아니다. 파워 쪽 8핀·16핀이 둘 다 0이면 판정 불가라
  숨기면 안 되고, 16핀 부족은 남는 8핀이 있으면 경고다. 지금의 제약 종류로 옮기면 판정과 어긋난다
- 고를 때 거르기의 규칙 18(SATA) 보드 방향 — 포트 수가 두 키의 합이고 0은 미입력이다. 드라이브 방향은 「SATA가 아닌 것만」
  제약 종류가 새로 필요하고 SATA 드라이브를 포트 수 이상 담는 경우가 드물어 효과가 작다

