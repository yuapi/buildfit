# 배포 준비

**아직 배포하지 않았다.** 이 문서는 배포하려면 무엇이 필요한지, 그리고
**무엇을 확인해야 조용히 잘못 배포되지 않는지**를 적는다.

`docs/pipeline-plan.md`(자율 운영 인프라)는 이 상태가 된 **뒤에** 착수한다.
그러므로 여기 목록이 그 선행 조건이다.

여기 적힌 동작은 전부 프로덕션 빌드(`npm run build` → `npm start`)로 실제
확인한 것이다. 확인한 날짜: 2026-09-22.

## 1. 필요한 것

| 것 | 필수 | 없으면 |
|---|---|---|
| PostgreSQL 16 | ✅ | 아래 §3 |
| `DATABASE_URL` | ✅ | 마이그레이션·적재·빌드가 전부 실패한다 |
| `NEXT_PUBLIC_SITE_URL` | ⚠️ **빌드 시점에** | `localhost:3000`이 색인에 올라간다. §2 |
| `ADMIN_TOKEN` (16자 이상) | 선택 | `/admin`이 404. 보강을 못 한다 |
| OpenDB clone + `OPENDB_PATH` | 적재할 때만 | 카탈로그가 빈다 |

캐시도 큐도 두지 않는다 (ADR-0010). 배포 단위는 **Next.js 하나 + DB 하나**다.

## 2. ★ `NEXT_PUBLIC_SITE_URL`은 빌드 시점에 있어야 한다

sitemap과 `robots.txt`는 SSG라 **파일로 구워져** 배포된다. 런타임에만 넣으면
기본값이 그대로 굳는다.

```
$ curl -s https://<도메인>/robots.txt
Sitemap: http://localhost:3000/sitemap/pages.xml   ← 이렇게 나간다
```

**오류가 나지 않는다.** 200이고 형식도 맞다. 색인이 잘못될 뿐이다.
부품 상세 페이지의 `rel=canonical`도 같은 값을 쓴다 (이슈 #11).

그래서 배포 뒤 확인은 선택이 아니다. §5의 체크리스트에 넣었다.

빌드에서 던지게 만들지 않은 이유: CI가 프로덕션 빌드를 도는데 CI에는 도메인이
없다. 던지게 하면 CI가 깨지고, 그러면 그 검사를 끄게 된다.

## 3. DB가 끊기면 어떻게 되는가

**공개 화면은 200을 낸다.** 각 화면이 "지금은 불러올 수 없습니다"로 떨어진다 —
사용자에게는 이게 맞다. 규칙 설명(`/rules`)처럼 DB 없이 보여줄 수 있는 것은
숫자만 빼고 낸다.

확인한 동작 (`DATABASE_URL`을 닫힌 포트로 두고):

| 주소 | 응답 |
|---|---|
| `/` `/part` `/part/ram` `/rules` `/build/<코드>` | 200, 안내 문구 |
| `/healthz` | **503** `{"ok":false}` |

**그래서 배포 플랫폼은 `/healthz`를 봐야 한다.** 화면의 200을 건강으로 읽으면
DB가 끊긴 채로 계속 서비스된다. 이 주소는 인증이 없으므로 몸통에
오류 내용도 접속 문자열 조각도 넣지 않는다 — 200이냐 503이냐만 말한다.
`robots.txt`가 색인에서 뺀다.

## 4. `ADMIN_TOKEN`이 없으면 `/admin`이 404다 (ADR-0020)

프로덕션 빌드에서 확인했다.

```
/admin                                          404
/admin/gaps/PCCase/supported_psu_form_factors   404
/admin/parts/<id>                               404
```

**404 응답의 몸통에도 어드민 데이터가 없다.** 이건 한 번 틀렸던 부분이다 —
레이아웃에서만 막았을 때는 404를 주면서 본문에 필드 이름과 결측 건수를 실어
보냈다. 그래서 각 화면이 **데이터를 만지기 전에** 스스로 막고,
`apps/web/test/admin-guard.test.ts`가 새 화면이 그걸 빠뜨리는 것을 잡는다.

토큰을 만들 때: `openssl rand -base64 24`. 계정이 아니라 비밀 하나이므로
브라우저가 물으면 **아이디 칸은 비우고** 이 값만 넣는다.

## 5. 배포 순서

```bash
# 1. 스키마
DATABASE_URL=... npm run migrate

# 2. 적재 (첫 배포, 그리고 주 1회 — 명세 §5.6)
DATABASE_URL=... OPENDB_PATH=... npm run ingest

# 2b. 성능 측정값 (선택 — ADR-0023). 부품 적재 **뒤에** 돈다. 빼면 「측정값 없음」이 나올 뿐이다
curl -sSO https://opendata.blender.org/snapshots/opendata-latest.zip
DATABASE_URL=... npm run ingest:benchmarks -- opendata-latest.zip

# 3. 빌드. ★ 도메인을 여기서 준다
NEXT_PUBLIC_SITE_URL=https://<도메인> DATABASE_URL=... npm run build

# 4. 실행
DATABASE_URL=... ADMIN_TOKEN=... npm start
```

적재는 멱등하다 (`opendb_id` upsert). **재적재해도 `parts.id`가 유지되므로**
이미 뿌려진 공유 링크가 살아 있다 (ADR-0012,
`apps/ingest/test/id-stability.test.ts`가 지킨다).

### 배포 뒤 확인

- [ ] `/healthz` → `{"ok":true}`
- [ ] `/robots.txt`의 `Sitemap:` 줄이 **실제 도메인**이다 (§2)
- [ ] `/sitemap/pages.xml`이 비어 있지 않다
- [ ] 부품 상세 페이지의 `rel=canonical`이 실제 도메인이다
- [ ] `/admin`이 비밀 없이는 404, 비밀로는 열린다
- [ ] `/` 에서 견적을 하나 구성해 판정이 나온다

## 6. 아직 정하지 않은 것

**도메인** (명세 §12). 정해지기 전에는 §2가 확인할 수 없다.

**마이그레이션 시점.** 지금은 손으로 돌린다. 컬럼 추가는 expand-contract의 T0라
구버전과 공존한다 (pipeline-plan §7.1) — 즉 **마이그레이션을 먼저 돌리고 배포하는
순서가 안전하다.** 자동화는 pipeline-plan의 몫이다.

**백업.** 개인정보를 다루지 않으므로(ADR-0001) DB는 전부 재생성 가능하다 —
OpenDB 적재는 멱등하고 clone에서 다시 만들면 된다. **예외가 하나 있다:
어드민이 손으로 채운 값**(`part_specs`에서 `source_url`이 OpenDB가 아닌 행)은
어디에도 사본이 없다. 이 프로젝트에서 가장 비싼 데이터이므로 백업 대상은
사실상 그 행들이다. 적재의 「낡은 스펙 정리」가 그 행을 건드리지 않는 이유도
같다.

**릴리스 태그.** `main`은 "배포된 것만" 담고 Phase 완료마다 minor를 올린다
(CLAUDE.md). 아직 배포한 것이 없으므로 `main`은 비어 있고 태그도 없다.
**첫 배포 때 `release/0.3.0`을 따서 `main`에 머지하고 태그를 붙인다** —
Phase 0b가 `v0.2.0`이었어야 하므로 Phase 1 완료가 `v0.3.0`이다.

**Phase가 끝났다고 배포 전에 `main`에 머지하지 않는다.** 0a(2026-09-23, 유통 매칭을
폐기하며 완료 — ADR-0022)와 0b가 끝났지만 `v0.1.0`·`v0.2.0`은 만들지 않았다. 배포하지
않은 코드를 `main`에 올리면 「배포된 것만」이 거짓이 된다. 버전은 **첫 배포 시점에 끝나
있는 마지막 Phase**로 정한다 — Phase 1이 끝나기 전에 배포하면 `v0.2.0`이다.
