# ADR-0019: 이름은 buildfit으로 한다 — 레포 이름을 제품에 맞춘다

## 상태
채택 (2026-09-21)

## 배경

**레포는 `partfit`인데 제품·코드·문서는 전부 `buildfit`이다.** 화면 좌상단 로고도
`buildfit`이다. 둘 중 하나로 맞춰야 한다.

어느 쪽이 실제로 쓰이고 있는지 세어봤다.

| | `partfit` | `buildfit` |
|---|---:|---:|
| 코드·문서 파일 | **0** | 58 |
| npm 패키지 이름 | — | `buildfit`, `@buildfit/compat`, `@buildfit/db`, `@buildfit/ingest` |
| DB 이름·사용자 | — | `buildfit` |
| ADR | — | 18건 전부 |
| 그 밖 | git 원격 주소 하나 | 화면 로고, 푸터, 페이지 제목 |

`partfit`은 **git 원격 주소에만** 있다. 코드에도 문서에도 한 번도 나오지 않는다
(`grep -rn "partfit"` 전수 확인).

## 결정

**제품 이름은 `buildfit`이고, GitHub 레포 이름을 거기에 맞춘다.**

레포 이름 변경은 **사용자가 해야 한다** — Settings → General → Repository name.
자동화 도구로 할 수 없다.

## 이유

### 1. ★ 도메인 어휘가 이미 "build"다

판정의 입력이 `Build`이고, 결과가 `BuildVerdict`이고, 공유 주소가 `/build/<코드>`이고,
코덱이 `encodeBuildCode`다. 화면 컴포넌트는 `BuildTool`이다.

```
packages/compat/src/parts.ts     export interface Build
packages/compat/src/verdict.ts   export interface BuildVerdict
apps/web/src/lib/build-code.ts   encodeBuildCode / decodeBuildCode
apps/web/src/app/build/[code]/   공유 링크
```

레포만 `partfit`이면 **이름이 코드의 어휘와 어긋난다.** 처음 들어온 사람이
`partfit`을 열었는데 안에서 `Build`가 나오면 두 이름이 다른 것을 가리킨다고 읽는다.

### 2. ★ 「부품이 맞는가」가 아니라 「조합이 맞는가」다

이 도구는 부품 하나를 평가하지 않는다. ADR-0004가 **성능 수치를 단일 점수로 만들지
않는다**고 못 박았고, 규칙 10개가 전부 **둘 이상의 부품 사이**를 본다 —
소켓끼리, 폼팩터끼리, 길이와 한계끼리.

`partfit`은 "이 부품이 맞나"로 읽히는데 그건 이 도구가 **하지 않는** 일이다.
`buildfit`은 "이 조합이 맞나"다. 로고도 그렇게 그렸다 — 맞물린 두 조각이다.

### 3. 바꾸는 비용이 한쪽으로 크게 기운다

| | 레포 → `buildfit` | 코드 → `partfit` |
|---|---|---|
| 코드 변경 | **0줄** | npm 스코프 4개, import 전부 |
| 운영 | 없음. GitHub가 옛 주소를 자동 전달한다 | DB 이름·사용자 변경 → 접속 문자열, docker-compose, CI, 마이그레이션 절차 |
| 문서 | 없음 | ADR 18건과 조사 문서 전부 |
| 남는 어긋남 | 없음 | `Build`·`/build/`·`BuildTool`이 이름과 계속 어긋난다 |

레포 이름은 코드 어디에도 없으므로(§배경) **이름을 바꿔도 깨지는 것이 없다.**
기존 clone도 GitHub의 자동 전달로 계속 동작한다.

### 검토한 대안

| 대안 | 탈락 이유 |
|---|---|
| 코드를 `partfit`으로 바꾼다 | 위 표. 게다가 §2의 뜻이 어긋난다 |
| 둘 다 둔다 (레포 `partfit`, 제품 `buildfit`) | 지금 상태다. 처음 보는 사람이 같은 것인지 알 수 없다 |
| 제3의 이름 | 바꿀 이유가 없다. `buildfit`은 하는 일을 정확히 말한다 |

## 결과

- **사용자가 할 일 하나**: GitHub Settings → General → Repository name → `buildfit`.
  그 뒤 로컬에서 `git remote set-url origin https://github.com/yuapi/buildfit`
  (안 해도 자동 전달로 동작하지만 정리해 두는 편이 낫다)
- 이름을 코드에 박지 않는다. 지금도 레포 이름은 어디에도 없고, **그 상태를 유지한다** —
  박아두면 다음 개명이 코드 변경이 된다
- 문서의 이슈 링크는 `../../issues/N` 상대 경로다 (14곳). 레포 이름이 바뀌어도 그대로 동작한다
- 제품 이름을 `README.md`와 `CLAUDE.md`에 명시한다. 암묵이면 또 갈라진다
