# ROADMAP (autopilot 자동 생성)

last_scan: 2026-10-02

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
| 로컬 저장 (저장·최근 구성·작업 중·설정) | 완성 | `apps/web/src/lib/storage.ts` |
| 최근 본 부품 (`recent_parts`) | 완성 (T-16·T-17) | `components/RecentParts.tsx`, 고르기 목록, `pickableAmong` |
| 저장 목록 내보내기·가져오기 | 완성 (T-11·T-12) | `apps/web/src/lib/build-backup.ts`, `SaveBox` |
| 전력·전기요금 | 완성 | `/calc/power`, `packages/compat/src/power.ts` |
| 부품 상세 + 호환 목록 | **부분** | CPU↔보드 소켓만. 소켓 등가 표를 안 써 Threadripper 33개가 빈다 → T-10 |
| 두 부품 비교 + 렌더링 측정값 | 완성 | `/compare/[a]/vs/[b]` |
| 검사 규칙·데이터 현황 | 완성 | `/rules` |
| 어드민 (빈 필드 보강·어긋난 값) | 완성 | `/admin`, ADR-0020 |
| `/guide/:topic` | 비워 둠 (의도) | 명세 §8 — 사람이 쓰는 글, 지어내지 않는다 |

### 빠진 것 (2026-10-02 재발굴)
- **없음.** 명세의 Phase 1 항목은 전부 들어왔다 (§8A.3 백업 → T-11·T-12). 저장만 하고 아무도 부르지 않던 `recent_parts` → T-16·T-17
- 명세 §8의 `/guide`는 사람이 쓰는 글이라 비워 둔다 (의도)

### 약한 것 (2026-10-02 재발굴)
- **없음.** 이번 사이클에 고친 것: 호환 목록의 소켓 등가(T-10), 스토리지만 담은 공유 링크(T-14), 사라진 부품을 조용히 빼던 것(T-15)
- 입력 경로(검색·견적서·고르기·계산기)는 길이·개수 상한과 숫자 검증(음수·하루 24시간 초과)이 이미 있다
- 쿨러·메모리·케이스의 호환 목록 → 「하지 않기로 한 것」으로 옮겼다

## 현재 상태 요약
- 베이스라인: typecheck 0 err · lint 0 err · test 275 / 444 / 537 pass · `next build` 성공
- 코드 마커(TODO·FIXME·HACK·XXX): 0건
- quantakrypto: 266파일, 발견 0
- security-audit: 0건 (next 16.3.6, T-1에서 올림)

## 우선 개선 영역
- 재발굴 (2026-10-02, 6회차, skill 1.5.0): **실질 작업 0** → 최종 중단 (`.autopilot/STOP`)
  - 유지보수: typecheck 0 · lint 0 · test 284/486/545 · build 성공, 마커 0, quantakrypto 274파일 0, 열린 이슈 0. security-audit MCP 연결 실패 — 마지막 감사(2026-10-01, 0건) 뒤 의존성 변경 없음
  - 테스트 공백: 새 모듈(build-backup·RecentParts·pickableAmong·missingCount) 전부 단위 테스트 + Playwright
  - 죽은 코드: `partsMatchingSpec`은 앱이 더 안 부르지만 db 패키지의 export이고 테스트가 쓴다 — 공개 인터페이스라 둔다

## 하지 않기로 한 것
- 다른 파일에서 안 쓰는 export 20개 (예: `GapPart`, `PickerPage`, `MAX_CANDIDATES`, `lookupPrefix`) — 대부분 공개 함수의 반환·인자 타입이고, export를 지우는 것은 공개 인터페이스 변경이다
- 테스트 파일명과 안 맞는 모듈 중 `gaps.ts`(다른 이름으로 import해 시험됨)·`benchmarks-cli.ts`·`verify-stability.ts`·`measure-quote.ts`(CLI 진입점) — 공백이 아니다
- 고를 때 거르기의 규칙 8(보조전원) — 오류 구간이 키 하나의 경계가 아니다. 파워 쪽 8핀·16핀이 둘 다 0이면 판정 불가라
  숨기면 안 되고, 16핀 부족은 남는 8핀이 있으면 경고다. 지금의 제약 종류로 옮기면 판정과 어긋난다
- 고를 때 거르기의 규칙 18(SATA) 보드 방향 — 포트 수가 두 키의 합이고 0은 미입력이다. 드라이브 방향은 「SATA가 아닌 것만」
  제약 종류가 새로 필요하고 SATA 드라이브를 포트 수 이상 담는 경우가 드물어 효과가 작다
- 쿨러·메모리·케이스 부품 페이지의 호환 목록 (2026-10-02) — 짝이 되는 값(지원 소켓·지원 폼팩터·DDR 규격)이 이미 그 페이지의
  스펙으로 보이고, 견적 도구의 고르기가 같은 값으로 거른다(ADR-0016). 수천 개 중 12개를 보여주는 목록은 판단을 돕지
  않는다. CPU↔보드는 소켓이 첫 짝이라 의미가 있었다. 명세 §8이 카테고리별 대조 축을 정하지 않아, 하려면 명세부터다
