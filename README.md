# buildfit

PC 부품 호환성·소비전력·전기요금을 검증하는 견적 도구.

## 무엇인가

"이 조합, 문제 없나?"에 답한다. 부품 조합을 입력받아 **살 수 있는 조합인지, 낭비가
없는지, 유지비가 얼마인지**를 알려준다.

- **호환성 판정** — 소켓·폼팩터·물리 치수·커넥터까지. 단순 소켓 체크를 넘어 실제로
  조립하다 막히는 지점을 다룬다
- **소비전력 계산과 PSU 권장** — 조합 기준 총 소비전력에서 정격 용량을 역산한다
- **한국 누진세 기반 전기요금** — 가구 전체 사용량에 PC 사용분을 얹어 누진 구간이
  올라가는지까지 계산한다 (Phase 1)

## 가격 비교 서비스가 아니다

buildfit은 **가격 비교 커머스가 아니다.** 다나와·에누리와 경쟁하지 않으며 다음을
하지 않는다.

- 최저가 나열, 쇼핑몰 제휴 기반 가격 순위
- 부품 판매 또는 중개

가격 정보는 Phase 2에서 "대략 이 정도" 수준의 참고값으로만 다루고, 수집 시각을
함께 표시한다. 이 도구의 목적은 구매처 안내가 아니라 **판단을 돕는 것**이다.

## 현재 상태

**개발 초기 단계다.** 아직 사용할 수 있는 기능이 없다.

- 현재 Phase: **0a — OpenDB 적재 + 국내 유통 매칭 + 어드민**
- 기술 스택: **Next.js (TypeScript) + PostgreSQL** ([ADR-0010](docs/decisions/0010-nextjs-typescript-stack.md))
- 설계 문서와 결정 기록이 대부분이고, 코드는 방금 스캐폴드를 세운 단계다

## 구조

```
apps/web/           Next.js 앱 (App Router, SSR/ISR)
packages/compat/    호환성 규칙 엔진 — 프레임워크·DB 비의존 순수 TS 모듈
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
npm run build
```

Node 20.9 이상이 필요하다.

## 문서

| 문서 | 내용 |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | 세션 컨텍스트, 작업 규칙 |
| [`docs/pc-builder-spec.md`](docs/pc-builder-spec.md) | 제품 정의서 — 무엇을 만드는가 |
| [`docs/pipeline-plan.md`](docs/pipeline-plan.md) | 자율 운영 인프라 설계 (구현 보류) |
| [`docs/handoff-guide.md`](docs/handoff-guide.md) | 세션 이전 가이드, 이슈 순서 |
| [`docs/decisions/`](docs/decisions/) | ADR — 왜 그렇게 정했는가 |
| [`docs/research/`](docs/research/) | 조사 결과 |

## 로드맵

| Phase | 내용 |
|---|---|
| 0a | OpenDB 적재 + 국내 유통 매칭 + 어드민 |
| 0b | 호환성 체크 + 전력 계산 |
| 1 | 전기요금, 쿨러·스토리지 추가 |
| 2 | 가격 연동 + 상품명 정규화 |
| 3 | 성능 분석 (병목·견적 비교·업그레이드 진단) |
| 4 | 가격 통계 지표 |
| 5 | 계절성 분석 |

상세는 `docs/pc-builder-spec.md` §11.

## 데이터 출처

부품 스펙 1차 소스는 [BuildCores OpenDB](https://github.com/buildcores/buildcores-open-db)
(ODC-By 1.0). 출처 표기 의무가 있으므로 부품 상세 페이지와 사이트 하단에 표기 영역을
둔다. 상세는 `docs/pc-builder-spec.md` §5.7.
