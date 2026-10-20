# PROPOSALS (autopilot 제안)

Large changes the loop does not make on its own are handed to people here. Change only the Status column:
- `adopted`: the next discovery turns it into a feature document and tasks (public interface changes are allowed within the scope written here)
- `rejected`: it will not be proposed again
- `deferred`: look at it again later
- `proposed` (new item) → a person changes it to one of the three above. The loop moves adopted items to `in_progress` → `done`

next_id: 2

| ID | Status | Title | Problem & evidence | Proposal | Alternatives | Impact & compatibility | Cost (tasks) | Risk | Date |
|---|---|---|---|---|---|---|---|---|---|
| P-1 | proposed | 공유 링크 미리보기 이미지 | 공유가 주된 전파 경로인데(`/build/[code]` generateMetadata 주석) 카톡·디스코드 미리보기에 이미지가 없다 — `og:image` 0건. 제목·설명은 판정 요약이 들어간다 | `next/og`(Next 내장, 새 의존성 없음)로 `/build/[code]/opengraph-image` — 부품 이름 목록 + 판정 개수(통과·경고·오류) | ① 사이트 공통 로고 이미지 하나만 ② 지금처럼 글자만 | 공개 화면 추가만, 기존 동작 그대로. 디자인 결정(ADR-0014·0015 시각 정체성)이 필요해 제안으로 | 2~3 | 이미지 렌더 비용(요청마다 동적) — 캐시 헤더 필요 | 2026-10-20 |
