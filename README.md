# buildfit

PC 부품 호환성·소비전력·전기요금을 검증하는 견적 도구.

> **이름은 `buildfit`이다** (ADR-0019). 부품 하나가 아니라 **조합**이 맞는지를
> 판정하기 때문이고, 코드의 어휘도 그렇다 — `Build`, `/build/<코드>`, `BuildTool`.
> 레포 주소가 아직 `partfit`이면 아직 바꾸지 않은 것이다.

## 무엇인가

조립 전에 부품 조합을 검증한다. **살 수 있는 조합인지, 낭비가 없는지,
유지비가 얼마인지**를 판정한다.

- **호환성 판정** — 소켓·폼팩터·물리 치수·커넥터까지. 단순 소켓 체크를 넘어 실제로
  조립하다 막히는 지점을 다룬다
- **소비전력 계산과 PSU 권장** — 조합 기준 총 소비전력에서 정격 용량을 역산한다
- **견적서 붙여넣기** — 받아 온 견적서를 붙여넣으면 줄마다 부품을 찾아 채운다.
  일곱 칸을 손으로 채우지 않아도 된다 ([ADR-0018](docs/decisions/0018-quote-paste.md))
- **한국어 검색** — 라이젠·지포스·삼성으로 찾는다. 카탈로그는 전부 영문이다
  ([ADR-0017](docs/decisions/0017-korean-search.md))
- **한국 누진세 기반 전기요금** — 가구 전체 사용량에 PC 사용분을 얹어 누진 구간이
  올라가는지까지 계산한다. **같은 PC가 100kWh 집에서 2,693원, 380kWh 집에서
  10,742원이다** — PC 전력만 따로 곱하면 의미가 없다
- **같은 제품의 중복 기록을 하나로** — 원본에 같은 제품이 최대 7번 들어 있다.
  대표만 보여주고, 값이 어긋나면 그것도 밝힌다
  ([ADR-0021](docs/decisions/0021-contested-values.md))

### 모르는 것을 모른다고 한다

판정은 **통과 / 문제 / 판정 불가** 세 가지다
([ADR-0009](docs/decisions/0009-unknown-verdict-grade.md)).
데이터가 없으면 통과시키지 않는다 — 거짓 통과가 이 도구가 낼 수 있는 가장 나쁜
결과다. 그래서 **어디가 얼마나 비어 있는지도 공개한다** (`/rules`).

## 가격 비교 서비스가 아니다

buildfit은 **가격 비교 커머스가 아니다.** 다나와·에누리와 경쟁하지 않으며 다음을
하지 않는다.

- 최저가 나열, 쇼핑몰 제휴 기반 가격 순위
- 부품 판매 또는 중개

가격 정보는 Phase 2에서 "대략 이 정도" 수준의 참고값으로만 다루고, 수집 시각을
함께 표시한다. 이 도구의 목적은 구매처 안내가 아니라 **판단을 돕는 것**이다.

## 현재 상태

**앱이 돈다.** 부품을 고르거나 견적서를 붙여넣으면 판정이 나온다.
아직 배포하지 않았다 — 준비 항목은 `docs/deployment.md`.

| | 상태 |
|---|---|
| 부품 카탈로그 | 26,485건 / 스펙 229,675건 / 표기 변형 63,602건 |
| 호환성 규칙 | **15개 동작** (1~9, 12, 15~20) |
| 전기요금 | ✅ 한전 누진 구간 반영 ([이슈 #2](../../issues/2)) |
| 스토리지 | ✅ 규칙 17·18·19. **전력은 빠져 있고, 빠졌다고 적는다** ([이슈 #5](../../issues/5)) |
| 어드민 접근 제어 | ✅ 공유 비밀 하나 ([ADR-0020](docs/decisions/0020-admin-access-control.md)) |
| 남은 규칙 | 10·11·13·14 — 1차 소스에 필드가 없다 ([이슈 #4](../../issues/4)) |
| 국내 유통 매칭 | ⛔ 네이버 쇼핑 API 키 대기 ([이슈 #1](../../issues/1)) |
| 케이스 데이터 | 규칙 6 판정 불가 83% — 사람이 채워야 한다 ([이슈 #3](../../issues/3)) |

번호가 건너뛴 자리는 메우지 않는다. 명세 §4.2의 번호와 어긋나면 어느 쪽이
맞는지 매번 확인해야 한다.

기술 스택: **Next.js (TypeScript) + PostgreSQL**
([ADR-0010](docs/decisions/0010-nextjs-typescript-stack.md))

### 화면

| 주소 | 내용 |
|---|---|
| `/` | 견적 구성 + 판정. 견적서 붙여넣기 |
| `/build/<코드>` | 공유 링크. 견적 내용이 주소에 전부 담긴다 ([ADR-0012](docs/decisions/0012-share-url-format.md)) |
| `/part`, `/part/<카테고리>`, `/part/<카테고리>/<slug>` | 부품 목록·상세. 빈 값 제보 |
| `/compare/<a>/vs/<b>` | 같은 축을 공유하는 부품끼리만 비교 |
| `/calc/power` | 전기요금 계산기. 소비전력만 알 때 — 누진 구간 반영 |
| `/rules` | 무엇을 검사하고 **무엇을 모르는지** |
| `/admin` | 빈 필드 보강·값 충돌 목록. 공유 비밀 하나로 막는다 ([ADR-0020](docs/decisions/0020-admin-access-control.md)) |

## 구조

```
apps/web/           Next.js 앱 (App Router, SSR/ISR)
apps/ingest/        BuildCores OpenDB → PostgreSQL 적재 CLI
packages/compat/    호환성 규칙 엔진 — 프레임워크·DB 비의존 순수 TS 모듈
packages/db/        PostgreSQL 스키마와 접근 계층 (Drizzle)
docs/               설계 문서·ADR·조사 결과
```

**규칙 엔진을 별도 패키지로 둔 이유**는 클라이언트와 서버가 같은 판정 코드를 써야
하기 때문이다. 견적 편집 중 즉시 판정과 `/build/:hash` 공유 링크의 SSR 결과가 어긋나면
안 된다. 자세한 근거는 ADR-0010.

```bash
npm install
npm run dev         # apps/web 개발 서버
npm run typecheck   # 워크스페이스 전체
npm run lint
npm run test
npm run build
```

Node 20.9 이상이 필요하다.

이 다섯 가지가 CI에서도 그대로 돈다 (`.github/workflows/ci.yml`). 모든 브랜치의
push와 `develop`·`main`으로 가는 PR에서 실행된다.

`DATABASE_URL`이 있으면 `npm run test`에 **DB가 필요한 테스트**가 함께 돈다.
실행할 때마다 격리된 임시 DB를 만들고 끝나면 지운다 — 개발 DB를 건드리지 않는다.
`DATABASE_URL`이 없으면 건너뛰고, **CI에는 항상 있다**(없으면 테스트가 던진다).

| 테스트 | 무엇을 지키는가 |
|---|---|
| `id-stability` | `parts.id`가 재적재에 바뀌지 않는다. 바뀌면 공유 링크가 전부 죽는다 (ADR-0012) |
| `picker-sql` | 좁히기가 **스펙이 없는 부품을 숨기지 않는다** (ADR-0016) |
| `search-sql` | TS의 `squash`와 생성 컬럼이 글자 하나까지 같다 (ADR-0017) |
| `quote-sql` | 견적서 줄이 이름표 때문에 빗나가지 않는다 (ADR-0018) |
| `gaps` | 결측 집계가 `/rules`와 어드민에서 같은 수를 낸다 |

**`npm run build`는 DB를 필요로 한다.** sitemap이 SSG라 빌드 중에 부품 slug를
조회하기 때문이다. DB가 없으면 빌드가 실패한다 — 그래야 빈 색인이 조용히
배포되지 않는다. CI는 빈 PostgreSQL을 띄우고 마이그레이션만 적용해서 돈다.

### 데이터 적재

부품 데이터는 [BuildCores OpenDB](https://github.com/buildcores/buildcores-open-db)에서
가져온다. 레포에 포함하지 않고 별도로 clone한다 (ADR-0002).

```bash
cp .env.example .env
docker compose up -d db

# OpenDB clone (레포 바깥에)
git clone --depth 1 https://github.com/buildcores/buildcores-open-db ../buildcores-open-db

npm run migrate -w @buildfit/db     # 스키마 적용
npm run ingest  -w @buildfit/ingest # 적재
```

적재는 멱등하다. OpenDB 갱신은 `git pull` 후 재실행이면 된다 (주 1회).
**재적재해도 `parts.id`가 바뀌지 않으므로** 이미 뿌려진 공유 링크가 살아 있다
([ADR-0012](docs/decisions/0012-share-url-format.md)).

규모와 걸린 시간은 **적재가 끝날 때 스스로 찍는다** — 여기 적어두면 낡는다.
26,485건 · 22초 규모다 (2026-09-22).

### 실측 스크립트

수치를 문서에 적어두면 낡는다. 다시 잴 수 있게 둔다.

```bash
npm run sample        -w @buildfit/ingest  # 판정 불가율 표본 (규칙별)
npm run measure:quote -w @buildfit/ingest  # 견적서 줄 매칭 정확도 (ADR-0018)
```

### CI와 같은 조건으로 돌리기

```bash
npm run test:empty-db
```

CI는 postgres를 새로 띄우므로 **카탈로그가 비어 있다.** 로컬에는 적재된 2만여
건이 있어서, 실제 데이터에 기대는 테스트가 **로컬에서만 통과**할 수 있다.
이 명령이 빈 DB를 만들어 마이그레이션·테스트(`CI=true`)·프로덕션 빌드를 CI와
같은 순서로 돌린다.

## 문서

| 문서 | 내용 |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | 세션 컨텍스트, 작업 규칙 |
| [`docs/pc-builder-spec.md`](docs/pc-builder-spec.md) | 제품 정의서 — 무엇을 만드는가 |
| [`docs/compat-rules.md`](docs/compat-rules.md) | 규칙 15개의 판정식과 판정 불가 조건 |
| [`docs/deployment.md`](docs/deployment.md) | 배포 준비 — 무엇이 필요하고 무엇을 확인해야 하는가 |
| [`docs/pipeline-plan.md`](docs/pipeline-plan.md) | 자율 운영 인프라 설계 (구현 보류) |
| [`docs/handoff-guide.md`](docs/handoff-guide.md) | 세션 이전 가이드, 이슈 순서 |
| [`docs/decisions/`](docs/decisions/) | ADR — 왜 그렇게 정했는가 |
| [`docs/research/`](docs/research/) | 조사 결과 — 수치의 근거와 재측정 방법 |

## 로드맵

| Phase | 내용 |
|---|---|
| 0a | OpenDB 적재 + 국내 유통 매칭 + 어드민 |
| 0b | 호환성 체크 + 전력 계산 ✅ |
| 1 | 전기요금 ✅, 쿨러 ✅, 스토리지 ✅ (전력 제외) |
| 2 | 가격 연동 + 상품명 정규화 |
| 3 | 성능 분석 (병목·견적 비교·업그레이드 진단) |
| 4 | 가격 통계 지표 |
| 5 | 계절성 분석 |

상세는 `docs/pc-builder-spec.md` §11.

## 데이터 출처

부품 스펙 1차 소스는 [BuildCores OpenDB](https://github.com/buildcores/buildcores-open-db)
(ODC-By 1.0). 출처 표기 의무가 있으므로 부품 상세 페이지와 사이트 하단에 표기 영역을
둔다. 상세는 `docs/pc-builder-spec.md` §5.7.
