# PROPOSALS (autopilot 제안)

Large changes the loop does not make on its own are handed to people here. Change only the Status column:
- `adopted`: the next discovery turns it into a feature document and tasks (public interface changes are allowed within the scope written here)
- `rejected`: it will not be proposed again
- `deferred`: look at it again later
- `proposed` (new item) → a person changes it to one of the three above. The loop moves adopted items to `in_progress` → `done`

next_id: 3

| ID | Status | Title | Problem & evidence | Proposal | Alternatives | Impact & compatibility | Cost (tasks) | Risk | Date |
|---|---|---|---|---|---|---|---|---|---|
| P-1 | proposed | 공유 링크 미리보기 이미지 | 공유가 주된 전파 경로인데(`/build/[code]` generateMetadata 주석) 카톡·디스코드 미리보기에 이미지가 없다 — `og:image` 0건. 제목·설명은 판정 요약이 들어간다 | `next/og`(Next 내장, 새 의존성 없음)로 `/build/[code]/opengraph-image` — 부품 이름 목록 + 판정 개수(통과·경고·오류) | ① 사이트 공통 로고 이미지 하나만 ② 지금처럼 글자만 | 공개 화면 추가만, 기존 동작 그대로. 디자인 결정(ADR-0014·0015 시각 정체성)이 필요해 제안으로 | 2~3 | 이미지 렌더 비용(요청마다 동적) — 캐시 헤더 필요 | 2026-10-20 |
| P-2 | proposed | 사이트가 죽으면 알림 | 지금은 아무도 모른다 — `/healthz`를 밖에서 보는 것이 없다 (deployment.md §3·oci-migration §4.8이 권하지만 미설정). 자동 배포 실패도 journal 에만 남는다 | 무료 외부 업타임 서비스(UptimeRobot 등)에 `https://<도메인>/healthz` 5분 간격 + 메일 알림 | ① 서버 cron 이 /healthz 를 보고 실패 시 디스코드 웹훅(boss-scheduler 와 같은 방식) ② 지금처럼 없음 | 코드 변경 없음(①은 작은 스크립트). 외부 계정이 필요해 사람이 정한다 | 0~1 | 알림 계정·웹훅 비밀 관리 | 2026-10-20 |
