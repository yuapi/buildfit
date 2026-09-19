# 프로젝트 컨텍스트

## 무엇을 만드는가

PC 견적 검증 도구. 부품 조합의 호환성·전력·전기요금을 판정한다.
가격 비교가 아니라 **판단을 돕는 도구**다. 다나와와 경쟁하지 않는다.

상세: `docs/pc-builder-spec.md`

## 작업 규칙

1. **구현 전에 `docs/pc-builder-spec.md`의 해당 섹션을 먼저 읽는다.**
   추측으로 구현하지 않는다.
2. 스펙과 다르게 구현해야 할 이유가 생기면 **먼저 문서를 고치고 승인을 받는다.**
   코드와 문서가 어긋난 채로 진행하지 않는다.
3. 설계 결정은 `docs/decisions/`에 ADR로 남긴다.
4. 조사 결과는 `docs/research/`에 markdown으로 남긴다.
5. 커밋은 작게. 한 커밋에 한 가지 변경.

## 브랜치 전략

Git Flow를 따른다. 근거와 상세: `docs/decisions/0008-git-flow-branching.md`

| 브랜치 | 용도 | 분기 원본 | 머지 대상 |
|---|---|---|---|
| `main` | **배포된 것만.** 릴리스마다 태그 | — | — |
| `develop` | 통합 브랜치. 기본 브랜치 | `main` | — |
| `feature/<이슈번호>-<요약>` | 기능·문서·데이터 작업 | `develop` | `develop` |
| `release/<버전>` | 릴리스 준비 (버그 수정만) | `develop` | `main` + `develop` |
| `hotfix/<요약>` | 배포된 것의 긴급 수정 | `main` | `main` + `develop` |

- **`main`과 `develop`에 직접 커밋하지 않는다.** 항상 브랜치를 따서 머지한다
- 머지는 **`--no-ff`**. 작업 단위가 히스토리에 남아야 한다
- **이슈 하나 = feature 브랜치 하나.** 여러 이슈를 한 브랜치에서 처리하지 않는다
- 머지한 feature 브랜치는 삭제한다
- 이슈 번호가 없는 작업은 `feature/<요약>`
- 릴리스 태그는 semver. 1.0 이전이므로 **Phase 완료마다 minor를 올린다**
  (Phase 0a → `v0.1.0`, Phase 0b → `v0.2.0`, …)

```bash
# 작업 시작
git checkout develop && git pull
git checkout -b feature/1-opendb-schema-research

# 작업 종료
git checkout develop
git merge --no-ff feature/1-opendb-schema-research
git push origin develop
git branch -d feature/1-opendb-schema-research
```

## 절대 규칙

- **회원가입·로그인 기능을 만들지 않는다.** 개인정보를 다루지 않는 것이 이 프로젝트의 안전 전제다.
- **localStorage 저장 포맷은 add-only.** 필드 추가는 되지만 의미 변경·제거는 안 된다.
  서버는 롤백되지만 사용자 브라우저는 롤백되지 않는다.
- **성능 수치를 단일 점수로 만들지 않는다.** 용도·해상도 축으로 쪼개서 제시한다.
- **근거 없는 수치를 지어내지 않는다.** 데이터가 없으면 없다고 표시한다.
- 외부 데이터 출처는 `source_url`과 함께 저장한다.

## 현재 단계

**Phase 0a — 유통 매칭만 남음 (막힘)**
- OpenDB 적재 ✅ 부품 22,962건 (`apps/ingest`)
- 어드민(빈 필드 보강) ✅ (`/admin`)
- 국내 유통 매칭 ⛔ **네이버 쇼핑 API 키 대기** (handoff-guide §7의 사용자 작업)

**Phase 0b — 완료**
- 호환성 규칙 8개 동작 ✅ (`packages/compat`)
- 견적 구성 도구 ✅ (`/`)
- 공유 링크 ✅ (`/build/[code]`, ADR-0012)
- 로컬 저장 ✅ (§8A, ADR-0005)

로드맵: `docs/pc-builder-spec.md` §11

**다음 개선 지점**: 판정 불가의 대부분이 케이스 데이터다 (규칙 6, 83.3%).
`/admin`으로 채우면 그만큼 줄어든다. 근거: `docs/research/opendb-schema-analysis.md` §9.3.1

## 보류 중

`docs/pipeline-plan.md`는 자율 운영 인프라 설계다.
**지금은 구현하지 않는다.** 앱이 배포 가능한 상태가 된 뒤에 착수한다.
참고용으로만 읽는다.

## 기술 스택

확정: ADR-0010. 근거와 탈락 대안은 `docs/research/stack-requirements.md`.

| 구분 | 확정 |
|---|---|
| 프론트·백엔드 | **Next.js (TypeScript)** — App Router, SSR/ISR |
| DB | **PostgreSQL** — `part_specs`는 JSONB |
| 규칙 엔진 | 프레임워크 비의존 **순수 TS 모듈** |
| 정규화 워커 (Phase 2) | Python 별도 서비스. DB로만 연결 |
| 캐시·큐 | 두지 않는다 |

- **규칙 엔진을 Next.js에 의존시키지 않는다.** DB 접근도 프레임워크 API도 쓰지 않는
  순수 함수로 두고, 클라이언트와 서버가 같은 코드를 쓴다. 판정 로직이 두 벌이 되면
  "편집 중엔 통과인데 공유 링크에선 오류"가 난다
- Phase 2 Python 워커와의 경계는 **DB로만** 한정한다. HTTP로 엮지 않는다
