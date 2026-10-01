# ROADMAP (autopilot 자동 생성)

last_scan: 2026-10-01

## 현재 상태 요약
- 베이스라인: typecheck 0 err · lint 0 err · test 275 / 444 / 537 pass · `next build` 성공
- 코드 마커(TODO·FIXME·HACK·XXX): 0건
- quantakrypto: 266파일, 발견 0
- security-audit: 0건 (next 16.3.6, T-1에서 올림)

## 우선 개선 영역
- 재발굴 (2026-10-01, 3회차): 베이스라인 typecheck 0 · lint 0 · test 275/444/537 · build 성공. 마커 0, security-audit 0, quantakrypto 266파일 0
- 테스트 공백: `summarize`의 `counts.info`(이슈 #83)를 0 아닌 값으로 확인하는 테스트가 없다 → T-7. `requireAdmin`(어드민 2차 문지기)에 테스트 0 → T-8
- 죽은 코드: `metaForSlot` 참조 0 → T-9

## 하지 않기로 한 것
- 다른 파일에서 안 쓰는 export 20개 (예: `GapPart`, `PickerPage`, `MAX_CANDIDATES`, `lookupPrefix`) — 대부분 공개 함수의 반환·인자 타입이고, export를 지우는 것은 공개 인터페이스 변경이다
- 테스트 파일명과 안 맞는 모듈 중 `gaps.ts`(다른 이름으로 import해 시험됨)·`benchmarks-cli.ts`·`verify-stability.ts`·`measure-quote.ts`(CLI 진입점) — 공백이 아니다
- 고를 때 거르기의 규칙 8(보조전원) — 오류 구간이 키 하나의 경계가 아니다. 파워 쪽 8핀·16핀이 둘 다 0이면 판정 불가라
  숨기면 안 되고, 16핀 부족은 남는 8핀이 있으면 경고다. 지금의 제약 종류로 옮기면 판정과 어긋난다
- 고를 때 거르기의 규칙 18(SATA) 보드 방향 — 포트 수가 두 키의 합이고 0은 미입력이다. 드라이브 방향은 「SATA가 아닌 것만」
  제약 종류가 새로 필요하고 SATA 드라이브를 포트 수 이상 담는 경우가 드물어 효과가 작다

